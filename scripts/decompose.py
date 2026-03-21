import json
import os

with open('app.json') as f:
    app = json.load(f)

# Create directories
for d in ['.homeycompose/flow/triggers', '.homeycompose/flow/actions', '.homeycompose/flow/conditions', '.homeycompose/capabilities']:
    os.makedirs(d, exist_ok=True)

# 1. Top-level compose app.json (no flow/capabilities/drivers — those go in subfiles)
top_keys = ['id','sdk','brandColor','name','description','version','compatibility','author',
            'contributors','contributing','category','bugs','homeyCommunityTopicId',
            'support','homepage','images','platforms','api']
compose_app = {k: app[k] for k in top_keys if k in app}
with open('.homeycompose/app.json', 'w') as f:
    json.dump(compose_app, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('Created .homeycompose/app.json')

# 2. Capabilities
for cap_id, cap_def in app.get('capabilities', {}).items():
    with open(f'.homeycompose/capabilities/{cap_id}.json', 'w') as f:
        json.dump(cap_def, f, indent=2, ensure_ascii=False)
        f.write('\n')
print(f'Created {len(app.get("capabilities", {}))} capability files')

# 3. Flow triggers
for trigger in app.get('flow', {}).get('triggers', []):
    tid = trigger['id']
    with open(f'.homeycompose/flow/triggers/{tid}.json', 'w') as f:
        json.dump(trigger, f, indent=2, ensure_ascii=False)
        f.write('\n')
print(f'Created {len(app.get("flow",{}).get("triggers",[]))} trigger files')

# 4. Flow actions
for action in app.get('flow', {}).get('actions', []):
    aid = action['id']
    with open(f'.homeycompose/flow/actions/{aid}.json', 'w') as f:
        json.dump(action, f, indent=2, ensure_ascii=False)
        f.write('\n')
print(f'Created {len(app.get("flow",{}).get("actions",[]))} action files')

# 5. Flow conditions
for condition in app.get('flow', {}).get('conditions', []):
    cid = condition['id']
    with open(f'.homeycompose/flow/conditions/{cid}.json', 'w') as f:
        json.dump(condition, f, indent=2, ensure_ascii=False)
        f.write('\n')
print(f'Created {len(app.get("flow",{}).get("conditions",[]))} condition files')

print('Done!')

