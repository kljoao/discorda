"""Exercise update ordering and failure boundaries without a VPS or Docker."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASH = shutil.which('bash')
if os.name == 'nt' and Path('C:/Program Files/Git/bin/bash.exe').exists():
    BASH = 'C:/Program Files/Git/bin/bash.exe'


@unittest.skipUnless(BASH, 'Bash required')
class UpdateTests(unittest.TestCase):
    def exercise(self, failure):
        parent = Path(tempfile.gettempdir()).resolve()
        directory = Path(tempfile.mkdtemp(prefix='discorda-update-test-', dir=parent)).resolve()
        try:
            (directory / 'tools').mkdir()
            (directory / 'mock').mkdir()
            shutil.copyfile(ROOT / 'tools/update-vps.sh', directory / 'tools/update-vps.sh')
            mocks = {
                'flock': '#!/usr/bin/env bash\ntest "$FAILURE" != lock\n',
                'git': '''#!/usr/bin/env bash
case "$*" in
 'status --porcelain --untracked-files=normal') test "$FAILURE" != dirty || printf dirty ;;
 'remote get-url origin') printf 'https://github.com/example/discorda.git' ;;
 'rev-parse HEAD') printf old ;;
 rev-parse*) printf new ;;
 'merge-base --is-ancestor old new') test "$FAILURE" != diverged ;;
 *) printf 'git %s\n' "$*" >> events ;;
esac
''',
                'curl': '#!/usr/bin/env bash\nprintf \'{"tag_name":"v1.2.3"}\'\n',
                'python3': '''#!/usr/bin/env bash
if [[ "$1" == -c ]]; then cat >/dev/null; printf v1.2.3; else printf 'verify\n' >> events; test "$FAILURE" != health; fi
''',
            }
            for name, content in mocks.items():
                path = directory / 'mock' / name
                path.write_text(content, encoding='utf-8', newline='\n')
                path.chmod(0o700)
            (directory / 'tools/vps.sh').write_text('''#!/usr/bin/env bash
printf '%s\n' "$1" >> events
test "$1" != "$FAILURE"
''', encoding='utf-8', newline='\n')
            result = subprocess.run([BASH, '-c', 'PATH="$PWD/mock:$PATH" bash tools/update-vps.sh'], cwd=directory,
                                    env={**os.environ, 'FAILURE': failure}, capture_output=True, text=True, timeout=30)
            events = (directory / 'events').read_text().splitlines() if (directory / 'events').exists() else []
            if failure:
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('Atualização concluída', result.stdout)
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertLess(events.index('backup'), events.index('stop'))
                self.assertLess(events.index('stop'), events.index('git merge --ff-only v1.2.3'))
                self.assertLess(events.index('start'), events.index('verify'))
            if failure in ('dirty', 'lock', 'diverged', 'backup'):
                self.assertNotIn('stop', events)
        finally:
            if directory.parent != parent or not directory.name.startswith('discorda-update-test-'):
                raise RuntimeError('Unexpected cleanup path')
            shutil.rmtree(directory)

    def test_successful_order(self): self.exercise('')
    def test_backup_failure_keeps_calls_running(self): self.exercise('backup')
    def test_dirty_checkout_is_preserved(self): self.exercise('dirty')
    def test_diverged_checkout_is_preserved(self): self.exercise('diverged')
    def test_concurrent_update_refused(self): self.exercise('lock')
    def test_failed_health_is_not_success(self): self.exercise('health')


if __name__ == '__main__':
    unittest.main()
