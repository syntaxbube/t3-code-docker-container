import importlib.util
from pathlib import Path
import unittest
import hashlib
import json
import tempfile
import shutil

spec = importlib.util.spec_from_file_location('update_t3', Path(__file__).parents[1] / 'scripts/update_t3.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)

class UpdateTests(unittest.TestCase):
    def test_stable_releases_only_and_no_downgrades(self):
        release = {'tag_name': 'v0.2.0', 'draft': False, 'prerelease': False}
        self.assertEqual(updater.new_version(release, '0.1.7'), '0.2.0')
        self.assertIsNone(updater.new_version(release, '0.2.0'))
        self.assertIsNone(updater.new_version(release, '0.3.0'))
        self.assertIsNone(updater.new_version(dict(release, prerelease=True), '0.1.7'))
        self.assertIsNone(updater.new_version(dict(release, draft=True), '0.1.7'))
        self.assertIsNone(updater.new_version(dict(release, tag_name='v0.2.0-rc.1'), '0.1.7'))

    def test_both_checksums_are_required(self):
        checksums = f"{'a'*64}  t3-0.2.0-linux-x64.tar.gz\n{'b'*64}  t3-0.2.0-linux-arm64.tar.gz\n"
        self.assertEqual(updater.parse_checksums(checksums, '0.2.0'), {'amd64': 'a'*64, 'arm64': 'b'*64})
        with self.assertRaises(ValueError):
            updater.parse_checksums(checksums.splitlines()[0], '0.2.0')
        with self.assertRaises(ValueError):
            updater.parse_checksums(checksums.replace('a'*64, 'invalid'), '0.2.0')

    def test_dockerfile_update_preserves_provider_pins(self):
        source = (Path(__file__).parents[1] / 'Dockerfile').read_text()
        result = updater.update_dockerfile(source, '0.2.0', {'amd64':'a'*64, 'arm64':'b'*64})
        self.assertIn('ARG T3_VERSION=0.2.0', result)
        self.assertIn('test "$T3_VERSION" = 0.2.0;', result)
        self.assertIn('checksum=' + 'a'*64, result)
        self.assertIn('checksum=' + 'b'*64, result)
        for line in source.splitlines():
            if line.startswith(('ARG CODEX_VERSION=', 'ARG CLAUDE_VERSION=')):
                self.assertIn(line, result)


    def test_promotion_updates_store_and_preserves_persistent_mount(self):
        source_root = Path(__file__).parents[1]
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / 'repo'
            root.mkdir()
            for name in ['Dockerfile', 'README.md', 't3code-t3-code/umbrel-app.yml', 't3code-t3-code/docker-compose.yml']:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source_root / name, target)
            candidate = Path(temporary) / 'candidate'
            candidate.mkdir()
            source = (root / 'Dockerfile').read_text()
            (candidate / 'Dockerfile').write_text(updater.update_dockerfile(source, '0.2.0', {'amd64':'a'*64, 'arm64':'b'*64}))
            (candidate / 'release.json').write_text(json.dumps({'version':'0.2.0', 'package_version':'0.2.0-umbrel.1', 'previous_dockerfile_sha256':hashlib.sha256(source.encode()).hexdigest()}))
            app_before = (root / 't3code-t3-code/umbrel-app.yml').read_bytes()
            # A build based on stale source must never overwrite newer pins.
            (root / 'Dockerfile').write_text(source + '\n# changed during build\n')
            with self.assertRaises(ValueError):
                updater.promote(candidate, 'sha256:' + 'c'*64, root)
            self.assertEqual(app_before, (root / 't3code-t3-code/umbrel-app.yml').read_bytes())
            (root / 'Dockerfile').write_text(source)
            with self.assertRaises(ValueError):
                updater.promote(candidate, 'invalid', root)
            updater.promote(candidate, 'sha256:' + 'c'*64, root)
            self.assertIn('version: "0.2.0-umbrel.1"', (root / 't3code-t3-code/umbrel-app.yml').read_text())
            compose = (root / 't3code-t3-code/docker-compose.yml').read_text()
            self.assertIn(':0.2.0-umbrel.1@sha256:' + 'c'*64, compose)
            self.assertIn('${APP_DATA_DIR}/data/home:/home/node', compose)
            self.assertIn('Pinned tools: T3 Code **0.2.0**', (root / 'README.md').read_text())

if __name__ == '__main__':
    unittest.main()
