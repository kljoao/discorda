import importlib.util
from pathlib import Path
import unittest
import json
import tempfile
from unittest.mock import patch

upgrade_spec = importlib.util.spec_from_file_location('upgrade', Path(__file__).with_name('harden-database.py'))
upgrade = importlib.util.module_from_spec(upgrade_spec)
upgrade_spec.loader.exec_module(upgrade)

spec = importlib.util.spec_from_file_location('setup', Path(__file__).with_name('setup-vps.py'))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def arguments(self):
        return ['group.example.com', '8.8.8.8', 'owner@example.com', 'https://' + 'a'*20 + '.supabase.co', 'sb_publishable_' + 'a'*24, 'proxy-network', '172.30.0.2']

    def test_private_database_and_public_tls(self):
        files = setup.generate(*self.arguments())
        settings = json.loads(files['settings.json'])
        self.assertEqual(settings['LiveKit']['PublicUrl'], 'wss://group.example.com/media')
        self.assertEqual(settings['Proxy']['TrustedIp'], '172.30.0.2')
        self.assertNotIn('Certificate', files['settings.json'])
        self.assertNotEqual(files['postgres-password'], setup.generate(*self.arguments())['postgres-password'])
        self.assertIn('auto_create: false', files['livekit.yaml'])
        migration = json.loads(files['migration.json'])
        self.assertNotIn('Migration', settings)
        self.assertIn('Username=discorda_runtime;', settings['ConnectionStrings']['Database'])
        self.assertNotIn(files['postgres-password'], files['settings.json'])
        self.assertIn(files['postgres-password'], migration['ConnectionStrings']['Database'])
        self.assertIn(migration['Migration']['RuntimePassword'], settings['ConnectionStrings']['Database'])

    def test_legacy_upgrade_is_idempotent_and_keeps_owner_credentials_private(self):
        files = setup.generate(*self.arguments())
        legacy = json.loads(files['migration.json'])
        del legacy['Migration']
        with tempfile.TemporaryDirectory() as folder, patch.object(upgrade.os, 'chown', create=True):
            directory = Path(folder)
            (directory / 'settings.json').write_text(json.dumps(legacy), encoding='utf-8')
            upgrade.prepare(directory)
            first = (directory / 'settings.json').read_bytes()
            migration = json.loads((directory / 'migration.json').read_text())
            self.assertEqual(legacy['ConnectionStrings'], migration['ConnectionStrings'])
            self.assertNotIn(files['postgres-password'].encode(), first)
            upgrade.prepare(directory)
            self.assertEqual(first, (directory / 'settings.json').read_bytes())

    def test_upgrade_refuses_custom_database_without_replacing_it(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            source = json.dumps({'ConnectionStrings': {'Database': 'Host=custom;Username=owner;Password=test'}})
            (directory / 'settings.json').write_text(source)
            with self.assertRaises(ValueError):
                upgrade.prepare(directory)
            self.assertEqual(source, (directory / 'settings.json').read_text())
            self.assertFalse((directory / 'migration.json').exists())

    def test_invalid_settings_cannot_inject_configuration(self):
        for position, value in [(0, 'good.example.com\nother.test'), (1, '127.0.0.1'), (2, 'bad\n@example.com'), (3, 'http://wrong.example.com'), (4, 'sb_secret_bad'), (5, 'proxy\nnet'), (6, 'not-an-ip')]:
            args = self.arguments()
            args[position] = value
            with self.assertRaises(ValueError):
                setup.generate(*args)


if __name__ == '__main__':
    unittest.main()
