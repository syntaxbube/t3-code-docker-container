"""Validate the community store contract without an Umbrel host."""
from pathlib import Path
import re
import yaml

root = Path(__file__).resolve().parents[1]
store = yaml.safe_load((root / 'umbrel-app-store.yml').read_text())
app_id = 't3code-t3-code'
app = yaml.safe_load((root / app_id / 'umbrel-app.yml').read_text())
compose = yaml.safe_load((root / app_id / 'docker-compose.yml').read_text())
assert app['id'] == app_id and app_id.startswith(store['id'] + '-')
assert app['storage'] == {'dataRoot': 'data'}
assert app['path'] == '/umbrel' and app['port'] == 3774
services = compose['services']
assert services['app_proxy']['environment'] == {'APP_HOST': f'{app_id}_server_1', 'APP_PORT': 8080}
server = services['server']
assert server['user'] == '1000:1000' and server['init']
assert server['environment']['APP_PASSWORD'] == '${APP_PASSWORD}'
assert server['volumes'] == ['${APP_DATA_DIR}/data/home:/home/node']
assert not any(key in server for key in ['ports', 'privileged', 'network_mode', 'cap_add'])
assert re.fullmatch(r'ghcr.io/syntaxbube/t3-code-docker-container:[\w.-]+(?:@sha256:[0-9a-f]{64})?', server['image'])
assert (root / app_id / 'data/home/.gitkeep').exists()
print('Store manifest, app metadata, proxy, persistence, and image reference: valid')
