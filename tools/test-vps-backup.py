"""Exercise backup failure boundaries without accessing Docker or private host settings."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASH = shutil.which("bash")
if os.name == "nt" and Path("C:/Program Files/Git/bin/bash.exe").exists():
    BASH = "C:/Program Files/Git/bin/bash.exe"

@unittest.skipUnless(BASH, "Bash is required")
class BackupTests(unittest.TestCase):
    def run_backup(self, failure):
        parent = Path(tempfile.gettempdir()).resolve()
        directory = Path(tempfile.mkdtemp(prefix="discorda-backup-test-", dir=parent)).resolve()
        try:
            (directory / "tools").mkdir()
            shutil.copyfile(ROOT / "tools/vps.sh", directory / "tools/vps.sh")
            (directory / "mock").mkdir()
            docker = directory / "mock/docker"
            docker.write_text('''#!/usr/bin/env bash
case "$*" in
 *pg_dump*) printf 'test-dump'; test "$FAILURE" != dump ;;
 *pg_restore*) cat >/dev/null; test "$FAILURE" != verify ;;
 *run*) cat > report.json; test "$FAILURE" != report ;;
 *) exit 90 ;;
esac
''', encoding="utf-8", newline="\n")
            docker.chmod(0o700)
            result = subprocess.run([BASH, "-c", 'PATH="$PWD/mock:$PATH" bash tools/vps.sh backup'], cwd=directory,
                                    env={**os.environ, "FAILURE": failure}, capture_output=True, text=True, timeout=30)
            files = list((directory / ".discorda/vps/backups").glob("*.dump"))
            if failure in ("dump", "verify"):
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(files, [])
                self.assertIn('"ok":false', (directory / "report.json").read_text())
            else:
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(files), 1)
                self.assertTrue(files[0].with_suffix(".dump.sha256").exists())
                self.assertIn('"ok":true', (directory / "report.json").read_text())
        finally:
            if directory.parent != parent or not directory.name.startswith("discorda-backup-test-"):
                raise RuntimeError("Unexpected test cleanup target")
            shutil.rmtree(directory)

    def test_success(self): self.run_backup("")
    def test_failed_dump_is_not_a_complete_backup(self): self.run_backup("dump")
    def test_failed_verification_is_not_a_complete_backup(self): self.run_backup("verify")
    def test_status_failure_does_not_invalidate_successful_backup(self): self.run_backup("report")

if __name__ == "__main__": unittest.main()
