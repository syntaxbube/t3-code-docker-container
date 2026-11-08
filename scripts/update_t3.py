"""Prepare stable T3 candidates; promote only after CI supplies a tested image digest."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = 'syntaxbube/t3-code-docker-container'


def new_version(release, current):
    tag = release.get('tag_name', '')
    if release.get('draft') or release.get('prerelease') or not re.fullmatch(r'v\d+\.\d+\.\d+', tag):
        return None
    version = tag[1:]
    parts = lambda value: tuple(map(int, value.split('.')))
    return version if parts(version) > parts(current) else None


def parse_checksums(text, version):
    result = {}
    for arch, upstream in [('amd64', 'x64'), ('arm64', 'arm64')]:
        filename = f't3-{version}-linux-{upstream}.tar.gz'
        matches = re.findall(r'^([a-fA-F0-9]{64})\s+\*?' + re.escape(filename) + r'\s*$', text, re.M)
        if len(matches) != 1:
            raise ValueError(f'Expected exactly one SHA-256 checksum for {filename}')
        result[arch] = matches[0].lower()
    return result


def replace_once(pattern, replacement, text):
    result, count = re.subn(pattern, lambda match: replacement(match), text, flags=re.M)
    if count != 1:
        raise ValueError(f'Expected exactly one match for {pattern}')
    return result


def update_dockerfile(text, version, checksums):
    text = replace_once(r'^ARG T3_VERSION=\S+$', lambda _: f'ARG T3_VERSION={version}', text)
    text = replace_once(r'test "\$T3_VERSION" = [\d.]+;', lambda _: f'test "$T3_VERSION" = {version};', text)
    for arch, checksum in checksums.items():
        text = replace_once(r'(' + arch + r'\) arch=\w+; checksum=)[a-f0-9]{64}', lambda m: m[1] + checksum, text)
    return text


def fetch(url):
    headers = {'Accept': 'application/vnd.github+json'} if url.startswith('https://api.github.com/') else {}
    if headers and os.environ.get('GH_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GH_TOKEN']
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
        return response.read().decode()


def prepare(directory):
    source = (ROOT / 'Dockerfile').read_text()
    current = re.search(r'^ARG T3_VERSION=(\d+\.\d+\.\d+)$', source, re.M)[1]
    release = json.loads(fetch('https://api.github.com/repos/pingdotgg/t3code/releases/latest'))
    version = new_version(release, current)
    if not version:
        print(f'No newer stable release (current: {current}).')
        return None
    expected = {'SHA256SUMS', f't3-{version}-linux-x64.tar.gz', f't3-{version}-linux-arm64.tar.gz'}
    if not expected <= {asset['name'] for asset in release['assets']}:
        raise ValueError('Stable release is missing required Linux archives or SHA256SUMS')
    checksums = parse_checksums(fetch(f'https://github.com/pingdotgg/t3code/releases/download/v{version}/SHA256SUMS'), version)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'Dockerfile').write_text(update_dockerfile(source, version, checksums))
    (directory / 'release.json').write_text(json.dumps({
        'version': version, 'package_version': version + '-umbrel.1',
        'previous_dockerfile_sha256': hashlib.sha256(source.encode()).hexdigest(),
    }))
    print(f'Prepared T3 Code {version} with checksums for both architectures.')
    return version


def promote(directory, digest, root=ROOT):
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError('Invalid image digest')
    metadata = json.loads((directory / 'release.json').read_text())
    version, package = metadata['version'], metadata['package_version']
    source = (root / 'Dockerfile').read_text()
    if hashlib.sha256(source.encode()).hexdigest() != metadata['previous_dockerfile_sha256']:
        raise ValueError('Dockerfile changed after candidate preparation; retry from current main')
    app_path = root / 't3code-t3-code/umbrel-app.yml'
    compose_path = root / 't3code-t3-code/docker-compose.yml'
    readme_path = root / 'README.md'
    app = replace_once(r'^version: .*$', lambda _: f'version: "{package}"', app_path.read_text())
    app = replace_once(r'^releaseNotes: >-\n[\s\S]*?(?=^developer:)', lambda _: f'releaseNotes: >-\n  Updated T3 Code to stable release {version}. Both Linux architectures passed\n  container smoke tests before publication. Codex and Claude versions are unchanged.\n', app)
    compose = replace_once(r'^    image: ghcr\.io/[^\s]+$', lambda _: f'    image: ghcr.io/{REPO}:{package}@{digest}', compose_path.read_text())
    readme = replace_once(r'Pinned tools: T3 Code \*\*[\d.]+\*\*', lambda _: f'Pinned tools: T3 Code **{version}**', readme_path.read_text())
    # Render and validate every replacement before changing tracked files.
    for path, text in [(root / 'Dockerfile', (directory / 'Dockerfile').read_text()), (app_path, app), (compose_path, compose), (readme_path, readme)]:
        path.write_text(text)
    print(f'Promoted T3 Code {version} to {package}@{digest}.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    prepare_parser = sub.add_parser('prepare')
    prepare_parser.add_argument('--output-dir', type=Path, required=True)
    promote_parser = sub.add_parser('promote')
    promote_parser.add_argument('--candidate', type=Path, required=True)
    promote_parser.add_argument('--digest', required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        version = prepare(args.output_dir)
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
                output.write(f'available={str(version is not None).lower()}\n')
                if version:
                    output.write(f'version={version}\n')
    else:
        promote(args.candidate, args.digest)


if __name__ == '__main__':
    main()
