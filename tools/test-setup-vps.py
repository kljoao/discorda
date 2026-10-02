import importlib.util
from pathlib import Path
import unittest
import json

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

    def test_invalid_settings_cannot_inject_configuration(self):
        for position, value in [(0, 'good.example.com\nother.test'), (1, '127.0.0.1'), (2, 'bad\n@example.com'), (3, 'http://wrong.example.com'), (4, 'sb_secret_bad'), (5, 'proxy\nnet'), (6, 'not-an-ip')]:
            args = self.arguments()
            args[position] = value
            with self.assertRaises(ValueError):
                setup.generate(*args)


if __name__ == '__main__':
    unittest.main()
