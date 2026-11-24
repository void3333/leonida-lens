import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import psn_bridge


class TestPSNBridge(unittest.TestCase):
    def test_01_block_malicious_and_plain_http_urls(self):
        bad=["http://safe.cloudfront.net/image.jpg", "https://evil.cloudfront.net.evil.com/x",
             "https://127.0.0.1/x", "https://localhost/x", "https://x.cloudfront.net:8443/x",
             "file:///etc/passwd", "https://user:pw@x.cloudfront.net/x"]
        for url in bad:
            self.assertFalse(psn_bridge.is_trusted_https(url),url)
        self.assertTrue(psn_bridge.is_trusted_https("https://image.cloudfront.net/photo.jpg"))

    def test_02_token_only_memory_non_windows(self):
        with tempfile.TemporaryDirectory() as directory:
            vault=psn_bridge.WindowsVault(Path(directory)/"token.dpapi")
            with patch.object(psn_bridge.sys,"platform","linux"):
                vault.save({"access_token":"secret","refresh_token":"other"})
                self.assertEqual(vault.load()["access_token"],"secret")
                self.assertFalse(vault.path.exists())
                vault.clear()
                self.assertIsNone(vault.load())

    def test_03_login_exchanges_sony_cookie_and_does_not_save_npsso(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge=psn_bridge.PSNBridge(Path(directory),lambda *a,**k: ('x',True),lambda m:False,lambda *a:None)
            calls=[]
            def fake_http(url,data=None,headers=None,no_redirect=False):
                calls.append((url,data,headers,no_redirect))
                if url.endswith('/authorize?'+url.split('/authorize?')[-1]):
                    return 302,{"Location":"com.scee.psxandroid.scecompcall://redirect?code=ABC123"},{}
                return 200,{}, {"access_token":"access","refresh_token":"refresh","expires_in":3600,"refresh_token_expires_in":3600}
            with patch.object(psn_bridge,"http_json",side_effect=fake_http),patch.object(psn_bridge.sys,"platform","linux"):
                bridge.connect("n"*64)
                self.assertEqual(len(calls),2)
                self.assertIn('npsso='+"n"*64,calls[0][2]['Cookie'])
                self.assertNotIn('npsso',json.dumps(bridge.vault.load()))
                self.assertTrue(bridge.state()['connected'])
                bridge.disconnect()
                self.assertFalse(bridge.state()['connected'])

    def test_04_download_only_gta_and_dedup(self):
        seen=set(); calls=[]
        with tempfile.TemporaryDirectory() as directory:
            def ingest(tmp,name):
                calls.append(name)
                return ("photo-1",True)
            bridge=psn_bridge.PSNBridge(Path(directory),ingest,lambda media:media in seen,lambda media,*_:seen.add(media))
            with patch.object(psn_bridge.sys,"platform","linux"):
                bridge.vault.save({"access_token":"x","refresh_token":"y","expires_at":time.time()+3600,"refresh_expires_at":time.time()+3600})
                data={"ugcDocument":[
                    {"id":"1","ugcType":1,"sceTitleName":"Grand Theft Auto VI","uploadDate":"2026-11-22T10:00:00Z","screenshotUrl":"https://a.cloudfront.net/x"},
                    {"id":"2","ugcType":1,"sceTitleName":"Another game","uploadDate":"2026-11-22T10:00:00Z","screenshotUrl":"https://a.cloudfront.net/y"},
                    {"id":"3","ugcType":2,"sceTitleName":"Grand Theft Auto VI","uploadDate":"2026-11-22T10:00:00Z","videoUrl":"https://a.cloudfront.net/x"},
                ]}
                with patch.object(psn_bridge,"http_json",return_value=(200,{},data)),patch.object(bridge,"_download",return_value=(b'\xff\xd8\xff'+b'X'*35,'.jpg')):
                    status=bridge.sync()
                    self.assertEqual(status['last_added'],1)
                    self.assertEqual(status['last_found'],3)
                    self.assertEqual(len(calls),1)
                    status=bridge.sync()
                    self.assertEqual(status['last_added'],0)
                    self.assertEqual(len(calls),1)

    def test_05_sony_redirect_is_required(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge=psn_bridge.PSNBridge(Path(directory),lambda *a:None,lambda _:False,lambda *a:None)
            with patch.object(psn_bridge,"http_json",return_value=(302,{"Location":"https://evil.example/redirect?code=abc"},{})):
                with self.assertRaises(psn_bridge.PSNError):
                    bridge.connect('n'*64)


    def test_06_npsso_paste_is_cleaned(self):
        v = "Ab12_-" * 11
        for pasted in (v, f' "{v}" ', f'{{"npsso":"{v}"}}', f'  {{ "npsso" : "{v}" }}' + chr(10)):
            self.assertEqual(psn_bridge.clean_npsso(pasted), v)

    def test_07_expired_npsso_gets_friendly_message(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge=psn_bridge.PSNBridge(Path(directory),lambda *a,**k: ('x',True),lambda m:False,lambda *a:None)
            fake=lambda *a,**k: (302,{"Location":"com.scee.psxandroid.scecompcall://redirect?error=login_required"},{})
            with patch.object(psn_bridge,"http_json",side_effect=fake):
                with self.assertRaises(psn_bridge.PSNError) as cm:
                    bridge.connect("n"*64)
            self.assertIn("expirou", str(cm.exception))

    def test_08_refused_refresh_clears_session(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge=psn_bridge.PSNBridge(Path(directory),lambda *a,**k: ('x',True),lambda m:False,lambda *a:None)
            def refused(*a,**k):
                raise psn_bridge.PSNError("Sony retornou HTTP 400.", 400)
            with patch.object(psn_bridge.sys,"platform","linux"), patch.object(psn_bridge,"http_json",side_effect=refused):
                bridge.vault.save({"access_token":"x","refresh_token":"y","expires_at":0,"refresh_expires_at":time.time()+3600})
                with self.assertRaises(psn_bridge.PSNError) as cm:
                    bridge.sync()
                self.assertIn("Token npsso", str(cm.exception))
                self.assertFalse(bridge.state()["connected"])
                self.assertIn("expirou", bridge.state()["last_error"])

    def test_09_network_failure_keeps_session(self):
        with tempfile.TemporaryDirectory() as directory:
            bridge=psn_bridge.PSNBridge(Path(directory),lambda *a,**k: ('x',True),lambda m:False,lambda *a:None)
            def offline(*a,**k):
                raise psn_bridge.PSNError("Não foi possível alcançar os servidores da Sony.")
            with patch.object(psn_bridge.sys,"platform","linux"), patch.object(psn_bridge,"http_json",side_effect=offline):
                bridge.vault.save({"access_token":"x","refresh_token":"y","expires_at":0,"refresh_expires_at":time.time()+3600})
                with self.assertRaises(psn_bridge.PSNError):
                    bridge.sync()
                self.assertTrue(bridge.state()["connected"])


if __name__=='__main__':unittest.main()
