'use strict';

/**
 * Setup wizard for the UniFi Network app settings.
 *
 * Walks a fresh installation through connecting to the UniFi controller.
 * Network V1 (username/password) is required — it is the only stack that can list
 * and pair devices. Network V2 (API key) is optional and only unlocks a couple of
 * extra flow actions (toggle WLAN, restart access point).
 *
 * Writes into the same single `com.ubnt.unifi.settings` object the regular tabs
 * use, patching only the fields it owns so nothing else is lost.
 */
(function () {
    const SETTINGS_KEY = 'com.ubnt.unifi.settings';
    const GUIDE_URL = 'https://github.com/steffjenl/com-homey-unifinetwork/blob/develop/docs/setup-guide.md';
    const GUIDE_ANCHOR = {
        v1: '#step-1--create-a-dedicated-local-admin-user-in-unifi',
        v2: '#generating-an-api-key-for-future-v26-dual-path-auth',
    };
    const INSTRUCTION_STEPS = {v1: 4, v2: 4};
    const DEFAULT_PORT = {v1: '443', v2: '443'};
    const EYE_ICONS = '<svg class="eye-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
        + '<svg class="eye-off-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

    let homey = null;
    let onClose = null;
    let state = null;
    let steps = [];
    let stepIndex = 0;
    let open = false;
    let testResultElement = null;

    const el = (id) => document.getElementById(id);

    // Never returns an empty string: an empty label would hide a validation message
    function t(key) {
        const fullKey = 'settings.wizard.' + key;
        const translation = homey.__(fullKey);
        return translation || fullKey;
    }

    function getSetting(key) {
        return new Promise((resolve) => {
            homey.get(key, (error, value) => resolve(error ? null : value));
        });
    }

    function setSetting(key, value) {
        return new Promise((resolve, reject) => {
            homey.set(key, value, (error) => (error ? reject(error) : resolve()));
        });
    }

    function callApi(method, path, body) {
        return new Promise((resolve, reject) => {
            homey.api(method, path, body, (error, result) => (error ? reject(error) : resolve(result)));
        });
    }

    // ---------------------------------------------------------------- rendering helpers

    function node(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function guideLink(section) {
        const link = node('a', 'wizard-guide', t('guide'));
        link.href = GUIDE_URL + (section && GUIDE_ANCHOR[section] ? GUIDE_ANCHOR[section] : '');
        link.target = '_blank';
        link.rel = 'noopener';
        return link;
    }

    function textField(labelText, value, type, onInput) {
        const wrapper = node('div', 'field row');
        const label = node('label', 'homey-form-label', labelText);
        wrapper.appendChild(label);

        const input = node('input', 'homey-form-input');
        input.type = type === 'password' ? 'password' : 'text';
        input.value = value || '';
        input.addEventListener('input', () => onInput(input.value));

        if (type === 'password') {
            const holder = node('div', 'password-wrapper');
            holder.appendChild(input);
            const toggle = node('button', 'toggle-password');
            toggle.type = 'button';
            toggle.innerHTML = EYE_ICONS;
            toggle.addEventListener('click', () => {
                const hidden = input.type === 'password';
                input.type = hidden ? 'text' : 'password';
                toggle.querySelector('.eye-icon').style.display = hidden ? 'none' : '';
                toggle.querySelector('.eye-off-icon').style.display = hidden ? '' : 'none';
            });
            holder.appendChild(toggle);
            wrapper.appendChild(holder);
        } else {
            wrapper.appendChild(input);
        }

        return wrapper;
    }

    function instructionList(connection) {
        const list = node('ol', 'wizard-steps');
        for (let i = 1; i <= INSTRUCTION_STEPS[connection]; i++) {
            const text = t(connection + '.s' + i).replace('__ip__', state.ip || '<ip>');
            list.appendChild(node('li', null, text));
        }
        return list;
    }

    function clearTestResult() {
        if (!testResultElement) return;
        testResultElement.className = 'wizard-test-result';
        testResultElement.textContent = '';
    }

    function testBlock(connection) {
        const holder = node('div', 'wizard-test');
        const button = node('button', 'homey-button-primary-full wizard-test-button', t('test.run'));
        button.type = 'button';
        const result = node('div', 'wizard-test-result');

        if (state.tested[connection] === true) {
            result.className = 'wizard-test-result ok';
            result.textContent = t('test.ok');
        } else if (state.tested[connection] === false) {
            result.className = 'wizard-test-result fail';
            result.textContent = t('test.fail');
        }

        button.addEventListener('click', () => {
            const error = validateStep(connection);
            if (error) {
                result.className = 'wizard-test-result fail';
                result.textContent = error;
                return;
            }

            button.disabled = true;
            result.className = 'wizard-test-result busy';
            result.textContent = t('test.busy');

            runTest(connection)
                .then((success) => {
                    state.tested[connection] = success;
                    result.className = 'wizard-test-result ' + (success ? 'ok' : 'fail');
                    result.textContent = success ? t('test.ok') : t('test.fail');
                })
                .catch(() => {
                    state.tested[connection] = false;
                    result.className = 'wizard-test-result fail';
                    result.textContent = t('test.fail');
                })
                .then(() => {
                    button.disabled = false;
                });
        });

        holder.appendChild(button);
        holder.appendChild(result);
        testResultElement = result;
        return holder;
    }

    function runTest(connection) {
        if (connection === 'v1') {
            return callApi('POST', '/test', {
                host: state.ip, port: state.v1port, user: state.username, pass: state.password,
            }).then((response) => !!response && response.status === 'success');
        }
        return callApi('POST', '/testApiKey', {
            host: state.ip, port: state.v2port, apiKey: state.apiKey,
            cloudEnabled: !!state.cloudEnabled, consoleId: state.cloudConsoleId,
        }).then((response) => !!response && response.status === 'success');
    }

    // ---------------------------------------------------------------- steps

    function renderWelcome(body) {
        body.appendChild(node('h3', 'wizard-step-title', t('welcome.title')));
        body.appendChild(node('p', null, t('welcome.body')));
        body.appendChild(guideLink());
    }

    function renderChoose(body) {
        body.appendChild(node('h3', 'wizard-step-title', t('choose.title')));
        body.appendChild(node('p', null, t('choose.body')));

        const row = node('label', 'wizard-choice');
        const input = node('input', 'wizard-choice-input');
        input.type = 'checkbox';
        input.checked = !!state.selected.v2;
        input.addEventListener('change', () => {
            state.selected.v2 = input.checked;
            row.className = input.checked ? 'wizard-choice selected' : 'wizard-choice';
        });
        if (input.checked) row.className = 'wizard-choice selected';

        const choiceBody = node('div', 'wizard-choice-body');
        choiceBody.appendChild(node('span', 'wizard-choice-title', t('choose.v2')));
        choiceBody.appendChild(node('span', 'wizard-choice-desc', t('choose.v2desc')));

        row.appendChild(input);
        row.appendChild(choiceBody);
        body.appendChild(row);
    }

    function renderServer(body) {
        body.appendChild(node('h3', 'wizard-step-title', t('server.title')));
        body.appendChild(node('p', null, t('server.body')));
        body.appendChild(textField(t('server.ip'), state.ip, 'text', (value) => {
            state.ip = value.trim();
        }));

        const toggleRow = node('label', 'homey-form-checkbox wizard-advanced');
        const toggle = node('input', 'homey-form-checkbox-input');
        toggle.type = 'checkbox';
        toggle.checked = state.advanced;
        toggleRow.appendChild(toggle);
        toggleRow.appendChild(node('span', 'homey-form-checkbox-checkmark'));
        toggleRow.appendChild(node('span', 'homey-form-checkbox-text', t('server.advanced')));
        body.appendChild(toggleRow);

        const ports = node('div', 'wizard-ports');
        ports.style.display = state.advanced ? 'block' : 'none';
        ports.appendChild(textField(t('server.v1port'), state.v1port, 'text', (value) => {
            state.v1port = value.trim();
        }));
        if (state.selected.v2) {
            ports.appendChild(textField(t('server.v2port'), state.v2port, 'text', (value) => {
                state.v2port = value.trim();
            }));
        }
        toggle.addEventListener('change', () => {
            state.advanced = toggle.checked;
            ports.style.display = toggle.checked ? 'block' : 'none';
        });
        body.appendChild(ports);
    }

    function renderConnection(body, connection) {
        body.appendChild(node('h3', 'wizard-step-title', t(connection + '.title')));
        body.appendChild(node('p', null, t(connection + '.intro')));
        body.appendChild(instructionList(connection));
        body.appendChild(guideLink(connection));

        const fields = node('fieldset', 'homey-form-fieldset');
        if (connection === 'v1') {
            fields.appendChild(textField(homey.__('settings.username'), state.username, 'text', (value) => {
                state.username = value;
                state.tested.v1 = null;
                clearTestResult();
            }));
            fields.appendChild(textField(homey.__('settings.password'), state.password, 'password', (value) => {
                state.password = value;
                state.tested.v1 = null;
                clearTestResult();
            }));
        } else {
            fields.appendChild(textField(homey.__('settings.apikey'), state.apiKey, 'password', (value) => {
                state.apiKey = value.trim();
                state.tested.v2 = null;
                clearTestResult();
            }));

            const cloudToggleRow = node('label', 'homey-form-checkbox wizard-advanced');
            const cloudToggle = node('input', 'homey-form-checkbox-input');
            cloudToggle.type = 'checkbox';
            cloudToggle.checked = !!state.cloudEnabled;
            cloudToggleRow.appendChild(cloudToggle);
            cloudToggleRow.appendChild(node('span', 'homey-form-checkbox-checkmark'));
            cloudToggleRow.appendChild(node('span', 'homey-form-checkbox-text', t('v2.cloud')));
            fields.appendChild(cloudToggleRow);

            const cloudConsoleIdField = textField(t('v2.consoleId'), state.cloudConsoleId, 'text', (value) => {
                state.cloudConsoleId = value.trim();
                state.tested.v2 = null;
                clearTestResult();
            });
            cloudConsoleIdField.style.display = state.cloudEnabled ? '' : 'none';
            fields.appendChild(cloudConsoleIdField);

            cloudToggle.addEventListener('change', () => {
                state.cloudEnabled = cloudToggle.checked;
                state.tested.v2 = null;
                clearTestResult();
                cloudConsoleIdField.style.display = cloudToggle.checked ? '' : 'none';
            });
        }
        body.appendChild(fields);
        body.appendChild(testBlock(connection));
    }

    function renderSummary(body) {
        body.appendChild(node('h3', 'wizard-step-title', t('summary.title')));
        body.appendChild(node('p', null, t('summary.body')));

        const list = node('ul', 'wizard-summary');
        const v1Status = state.tested.v1 === true ? t('summary.tested') : t('summary.untested');
        list.appendChild(node('li', null, t('v1.title') + ' — ' + v1Status));
        if (state.selected.v2) {
            const v2Status = state.tested.v2 === true ? t('summary.tested') : t('summary.untested');
            list.appendChild(node('li', null, t('v2.title') + ' — ' + v2Status));
        }
        body.appendChild(list);
    }

    function validateStep(step) {
        if (step === 'server') {
            return state.ip ? null : t('server.error');
        }
        if (step === 'v1') {
            return (state.username && state.password) ? null : t('v1.error');
        }
        if (step === 'v2') {
            if (!state.apiKey) return t('v2.error');
            if (state.cloudEnabled && !state.cloudConsoleId) return t('v2.cloudError');
            return null;
        }
        return null;
    }

    function buildSteps() {
        steps = ['welcome', 'choose', 'server', 'v1'];
        if (state.selected.v2) steps.push('v2');
        steps.push('summary');
    }

    function render() {
        const step = steps[stepIndex];
        testResultElement = null;
        const body = el('wizard_body');
        const nav = el('wizard_nav');
        body.innerHTML = '';
        nav.innerHTML = '';
        el('wizard_title').textContent = t('title');
        el('wizard_progress').textContent = t('progress') + ' ' + (stepIndex + 1) + '/' + steps.length;

        if (step === 'welcome') renderWelcome(body);
        else if (step === 'choose') renderChoose(body);
        else if (step === 'server') renderServer(body);
        else if (step === 'summary') renderSummary(body);
        else renderConnection(body, step);

        const error = node('div', 'wizard-error');
        error.style.display = 'none';
        body.appendChild(error);

        if (stepIndex > 0) {
            const back = node('button', 'wizard-button', t('back'));
            back.type = 'button';
            back.addEventListener('click', () => {
                stepIndex -= 1;
                render();
            });
            nav.appendChild(back);
        }

        const isLast = step === 'summary';
        const forward = node('button', 'wizard-button primary', isLast ? t('summary.finish') : (stepIndex === 0 ? t('start') : t('next')));
        forward.type = 'button';
        forward.addEventListener('click', () => {
            const message = validateStep(step);
            if (message) {
                error.textContent = message;
                error.style.display = 'block';
                return;
            }
            if (isLast) {
                forward.disabled = true;
                save()
                    .then(() => {
                        homey.alert(t('summary.saved'), 'info');
                        close();
                    })
                    .catch((saveError) => {
                        forward.disabled = false;
                        homey.alert(saveError);
                    });
                return;
            }
            if (step === 'choose') buildSteps();
            stepIndex += 1;
            render();
        });
        nav.appendChild(forward);

        const dismiss = node('button', 'wizard-button ghost', state.completed ? t('cancel') : t('skip'));
        dismiss.type = 'button';
        dismiss.addEventListener('click', () => {
            if (state.completed) {
                close();
                return;
            }
            getSetting(SETTINGS_KEY)
                .then((settings) => setSetting(SETTINGS_KEY, Object.assign({}, settings, {
                    wizard: {completed: true, skipped: true, version: 1},
                })))
                .catch(() => null)
                .then(close);
        });
        nav.appendChild(dismiss);
    }

    // ---------------------------------------------------------------- persistence

    function save() {
        return getSetting(SETTINGS_KEY).then((existing) => {
            const settings = Object.assign({}, existing || {});

            settings.host = state.ip;
            settings.port = state.v1port || DEFAULT_PORT.v1;
            settings.user = state.username;
            settings.pass = state.password;
            settings.sslverify = settings.sslverify === true;
            settings.site = settings.site || 'default';
            settings.interval = settings.interval || '15';
            settings.applicationFlows = settings.applicationFlows || '0';
            settings.pullmethode = settings.pullmethode || '1';

            if (state.selected.v2) {
                settings.v2host = state.ip;
                settings.v2port = state.v2port || DEFAULT_PORT.v2;
                settings.apiKey = state.apiKey;
                settings.v2cloud = {enabled: !!state.cloudEnabled, consoleId: state.cloudConsoleId || ''};
            }

            settings.migrations = Object.assign({}, settings.migrations, {v2HostSplit: true});
            settings.wizard = {
                completed: true, skipped: false, version: 1, completedAt: new Date().toISOString(),
            };

            return setSetting(SETTINGS_KEY, settings);
        });
    }

    function loadState() {
        return getSetting(SETTINGS_KEY).then((settings) => {
            settings = settings || {};
            const wizard = settings.wizard || {};

            state = {
                ip: settings.host || settings.v2host || '',
                v1port: settings.port || DEFAULT_PORT.v1,
                v2port: settings.v2port || settings.port || DEFAULT_PORT.v2,
                username: settings.user || '',
                password: settings.pass || '',
                apiKey: settings.apiKey || '',
                cloudEnabled: !!(settings.v2cloud && settings.v2cloud.enabled),
                cloudConsoleId: (settings.v2cloud && settings.v2cloud.consoleId) || '',
                advanced: false,
                selected: {v2: !!settings.apiKey},
                tested: {v1: null, v2: null},
                completed: !!wizard.completed,
            };

            // Network V1 (username + password) is required for device pairing
            state.configured = !!(settings.user && settings.pass);
            return state;
        });
    }

    // ---------------------------------------------------------------- visibility

    function setTabsVisible(visible) {
        const tabs = document.getElementsByClassName('tab');
        for (let i = 0; i < tabs.length; i++) {
            tabs[i].style.display = visible ? '' : 'none';
        }
        if (!visible) {
            const contents = document.getElementsByClassName('tabcontent');
            for (let i = 0; i < contents.length; i++) {
                contents[i].style.display = 'none';
            }
        }
    }

    function show() {
        open = true;
        stepIndex = 0;
        buildSteps();
        setTabsVisible(false);
        el('wizard').style.display = 'block';
        render();
    }

    function close() {
        open = false;
        el('wizard').style.display = 'none';
        setTabsVisible(true);
        const defaultTab = el('defaultOpen');
        if (defaultTab) defaultTab.click();
        if (typeof onClose === 'function') onClose();
    }

    function init(homeyInstance, options) {
        homey = homeyInstance;
        onClose = options && options.onClose;

        return loadState().then(() => {
            if (!state.configured && !state.completed) {
                show();
            }
            return state;
        });
    }

    function restart() {
        return loadState().then(() => {
            show();
            return state;
        });
    }

    window.UnifiWizard = {
        init: init,
        restart: restart,
        isOpen: function () {
            return open;
        },
    };
}());
