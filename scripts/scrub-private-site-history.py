"""Remove historical private deployment defaults without changing the current source tree.

Used only by the explicitly authorized one-time privacy cleanup workflow.
No deployment address or credential is embedded in this helper.
"""
import os
import re
import subprocess
import tempfile
from urllib.parse import urlparse

BASE = '05b8bc5b415383a4a4ae6009d62579cf1147b7a1'
WORKFLOW = '.github/workflows/android-shell.yml'

def git(*args, data=None, env=None):
    return subprocess.check_output(['git', *args], input=data, env=env)

def main():
    head = git('rev-parse', os.environ.get('CLEANUP_REF', 'HEAD')).decode().strip()
    subprocess.run(['git', 'merge-base', '--is-ancestor', BASE, head], check=True)
    commits = git('rev-list', '--reverse', '--topo-order', f'{BASE}..{head}').decode().splitlines()
    versions = {}
    private_hosts = set()
    for commit in commits:
        content = git('show', f'{commit}:{WORKFLOW}')
        versions[commit] = content
        for line in content.decode().splitlines():
            if 'SHELL_SITE_URL:' not in line:
                continue
            for url in re.findall(r'https?://[A-Za-z0-9.-]+(?::\d+)?/?', line):
                host = urlparse(url).hostname or ''
                if host.endswith('.netlify.app'):
                    private_hosts.add(host)
    if not private_hosts:
        print('No historical personal site defaults remain; nothing to rewrite.')
        return
    tokens = sorted(private_hosts | {host.removesuffix('.netlify.app') for host in private_hosts}, key=len, reverse=True)
    mapping = {}
    with tempfile.TemporaryDirectory() as directory:
        index_env = {**os.environ, 'GIT_INDEX_FILE': os.path.join(directory, 'index')}
        for old in commits:
            raw = git('cat-file', 'commit', old)
            header, message = raw.split(b'\n\n', 1)
            old_tree = next(line[5:].decode() for line in header.splitlines() if line.startswith(b'tree '))
            new_tree = old_tree
            content = versions[old]
            lines = content.splitlines(keepends=True)
            clean = b''.join(
                b'      SHELL_SITE_URL: ${{ secrets.SHELL_SITE_URL }}\n'
                if b'SHELL_SITE_URL:' in line and any(host.encode() in line for host in private_hosts)
                else line for line in lines
            )
            if clean != content:
                blob = git('hash-object', '-w', '--stdin', data=clean).decode().strip()
                git('read-tree', old_tree, env=index_env)
                git('update-index', '--add', '--cacheinfo', f'100644,{blob},{WORKFLOW}', env=index_env)
                new_tree = git('write-tree', env=index_env).decode().strip()
            new_header = []
            dropping_signature = False
            for line in header.splitlines():
                if line.startswith((b'gpgsig ', b'gpgsig-sha256 ')):
                    dropping_signature = True
                    continue
                if dropping_signature and line.startswith(b' '):
                    continue
                dropping_signature = False
                if line.startswith(b'tree '):
                    line = b'tree ' + new_tree.encode()
                elif line.startswith(b'parent '):
                    parent = line[7:].decode()
                    line = b'parent ' + mapping.get(parent, parent).encode()
                new_header.append(line)
            for token in tokens:
                message = message.replace(token.encode(), b'private-site')
            new_raw = b'\n'.join(new_header) + b'\n\n' + message
            new = git('hash-object', '-t', 'commit', '-w', '--stdin', data=new_raw).decode().strip()
            mapping[old] = new
            # Check the rewritten snapshots and messages without printing the values.
            for host in private_hosts:
                check = subprocess.run(['git', 'grep', '-I', '-q', '-i', '-e', host, new], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if check.returncode not in (1,):
                    raise RuntimeError('Historical snapshot verification did not pass')
            if any(token.encode() in message for token in tokens):
                raise RuntimeError('Commit message verification did not pass')
            # Author, committer and their dates must remain byte-for-byte unchanged.
            for field in (b'author ', b'committer '):
                before = next(line for line in header.splitlines() if line.startswith(field))
                after = next(line for line in new_header if line.startswith(field))
                if before != after:
                    raise RuntimeError('Commit identity metadata changed')
    rewritten = mapping[head]
    if git('rev-parse', f'{head}^{{tree}}') != git('rev-parse', f'{rewritten}^{{tree}}'):
        raise RuntimeError('Current source tree changed; refusing to publish')
    git('update-ref', 'refs/heads/privacy-scrubbed', rewritten)
    print(f'Verified {len(mapping)} rewritten commits; current source and author metadata preserved.')
    if os.environ.get('PUBLISH_CLEANUP') == 'true':
        subprocess.run(['git', 'push', f'--force-with-lease=refs/heads/main:{head}', 'origin', 'refs/heads/privacy-scrubbed:refs/heads/main'], check=True)
        print('Main history updated with an exact-head lease.')
    else:
        print('Dry run complete; no remote branch was changed.')

if __name__ == '__main__':
    main()
