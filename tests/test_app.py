"""Offline integration tests for the local app.
Run: python -m unittest discover -s tests -v
"""
import io
import json
import os
import subprocess
import sys
import struct
import zlib
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PORT = 17879
BASE = f'http://127.0.0.1:{PORT}'


def req(path, method='GET', body=None, headers=None):
    if isinstance(body, dict):
        body=json.dumps(body).encode()
        headers={**(headers or {}), 'Content-Type':'application/json'}
    r=urllib.request.Request(BASE+path, data=body, headers=headers or {}, method=method)
    with urllib.request.urlopen(r, timeout=20) as resp:
        raw=resp.read()
        if 'json' in resp.headers.get('Content-Type',''):
            return json.loads(raw)
        return raw


# Valid minimal 1x1 RGB PNGs, generated with only the standard library.
def make_png(rgb):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    return (b'\x89PNG\r\n\x1a\n' +
            chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress(b'\x00' + bytes(rgb))) +
            chunk(b'IEND', b''))


PNG = make_png((52, 85, 71))
PNG2 = make_png((152, 72, 48))


class TestApp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        env=dict(os.environ, LEONIDA_DATA_DIR=str(Path(cls.temp.name)/'DATA'))
        cls.proc=subprocess.Popen([sys.executable,str(ROOT/'app.py'),'--no-browser','--port',str(PORT)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        for _ in range(60):
            try:
                req('/api/health');break
            except (OSError, urllib.error.URLError):time.sleep(.1)
        else:raise RuntimeError('Server failed to start')

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        try: cls.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:cls.proc.kill()
        cls.temp.cleanup()

    def test_01_health_and_empty_library(self):
        self.assertTrue(req('/api/health')['ok'])
        self.assertEqual(req('/api/photos')['photos'],[])

    def test_02_import_and_deduplicate(self):
        h={'X-File-Name':'Teste_20261120.png','Content-Type':'application/octet-stream'}
        a=req('/api/import','POST',PNG,h)
        b=req('/api/import','POST',PNG,h)
        self.assertTrue(a['created'])
        self.assertFalse(b['created'])
        self.assertEqual(a['photo_id'],b['photo_id'])
        self.assertEqual(len(req('/api/photos')['photos']),1)
        self.__class__.photo_id=a['photo_id']
        self.assertGreater(len(req('/api/image/'+a['photo_id'])),32)
        self.assertGreater(len(req('/api/thumb/'+a['photo_id'])),32)

    def test_03_create_essay_and_edit_photo(self):
        essay=req('/api/essays','POST',{'title':'Sombras na cidade','description':'Um olhar documental'})['essay']
        p=req('/api/photos/'+self.photo_id,'PATCH',{'title':'Um lugar sem nome','location':'Little Cuba','notes':'Chuva de tarde','favorite':True,'rating':4,'essay_id':essay['id']})['photo']
        self.assertEqual(p['location'],'Little Cuba')
        self.assertEqual(p['rating'],4)
        self.assertTrue(p['favorite'])
        self.assertEqual(p['essay_id'],essay['id'])
        self.assertEqual(req('/api/essays')['essays'][0]['photo_count'],1)

    def test_04_journal(self):
        j=req('/api/journal','POST',{'title':'Primeira visita','place':'Vice City','day_at':'2026-11-21','body':'Observei a rua'})['entry']
        self.assertEqual(j['title'],'Primeira visita')
        changed=req('/api/journal/'+j['id'],'PATCH',{'body':'Voltei para casa'})['entry']
        self.assertEqual(changed['body'],'Voltei para casa')
        self.assertEqual(len(req('/api/journal')['entries']),1)

    def test_05_export(self):
        exported=req('/api/export')
        data=exported if isinstance(exported, dict) else json.loads(exported)
        self.assertEqual(len(data['photos']),1)
        self.assertEqual(len(data['essays']),1)
        self.assertEqual(len(data['journal']),1)
        self.assertNotIn('sha256', data['photos'][0])

    def test_06_folder_monitor(self):
        watch=Path(self.temp.name)/'Inbox';watch.mkdir()
        req('/api/settings','POST',{'watch_folder':str(watch)})
        # Another distinct PNG content still valid for image scan (using copy of test PNG but this dedups correctly)
        (watch/'outra_foto.png').write_bytes(PNG2)
        os.utime(watch/'outra_foto.png',(time.time()-10,time.time()-10))
        req('/api/scan','POST',{})
        for _ in range(45):
            status=req('/api/status')
            if status['last_checked']>=1 and not status['scanning']:
                break
            time.sleep(.2)
        self.assertEqual(status['last_checked'],1)
        self.assertEqual(len(req('/api/photos')['photos']),2)  # imports a new distinct file
        # Removing the source does not remove the managed archival copy.
        (watch/'outra_foto.png').unlink()
        self.assertEqual(len(req('/api/photos')['photos']),2)
        self.assertEqual(status['watch_folder'],str(watch))


if __name__=='__main__':unittest.main()
