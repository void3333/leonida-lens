"""Experimental, opt-in PlayStation cloud gallery adapter.

This uses UNOFFICIAL, undocumented PSN endpoints based on the public open-source
PS Clips Viewer research (CallMeTak/playstation-clip-viewer). It has not been
certified by Sony; a PSN account is not connected by default.

NPSSO is only accepted over loopback and is never stored or printed. On Windows
only encrypted OAuth tokens are persisted using the user's DPAPI profile.
Other platforms keep tokens only in the running Python process.
"""
from __future__ import annotations

import base64
import ctypes
import json
import os
import re
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

AUTH_BASE = "https://ca.account.sony.com/api/authz/v3/oauth"
MEDIA_BASE = "https://m.np.playstation.com/api/gameMediaService/v2/c2s/category/cloudMediaGallery/ugcType/all"
CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891"
REDIRECT_URI = "com.scee.psxandroid.scecompcall://redirect"
SCOPES = "psn:mobile.v2.core psn:clientapp"
# Public client authorization header embedded in the PlayStation mobile app;
# compatibility is not guaranteed and the token service can refuse requests.
CLIENT_AUTH = "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A="
TRUSTED_CDN_SUFFIXES = (
    ".playstation.com", ".playstation.net", ".sony.com", ".sonyentertainmentnetwork.com",
    ".cloudfront.net", ".amazonaws.com", ".akamaized.net", ".akamaihd.net",
)
MAX_SIZE = 80 * 1024 * 1024


class PSNError(Exception):
    pass


def is_trusted_https(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return False
    host = parsed.hostname.lower()
    if parsed.port not in (None, 443):
        return False
    return any(host.endswith(s) for s in TRUSTED_CDN_SUFFIXES)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class TrustedMediaRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not is_trusted_https(newurl):
            raise PSNError("Redirecionamento da mídia para endereço não autorizado.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def http_json(url, data=None, headers=None, no_redirect=False):
    headers = headers or {}
    if data is not None:
        data = urllib.parse.urlencode(data).encode("ascii")
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "LeonidaLens/2.0", **headers})
    handler = urllib.request.build_opener(NoRedirect()) if no_redirect else urllib.request.build_opener()
    try:
        with handler.open(req, timeout=15) as resp:
            content = resp.read(4 * 1024 * 1024)
            return resp.status, resp.headers, json.loads(content.decode("utf-8")) if content else {}
    except urllib.error.HTTPError as e:
        if no_redirect and e.code in (301, 302, 303, 307, 308):
            return e.code, e.headers, {}
        raise PSNError(f"Sony retornou HTTP {e.code}.") from None
    except urllib.error.URLError:
        raise PSNError("Não foi possível alcançar os servidores da Sony.") from None
    except (ValueError, json.JSONDecodeError):
        raise PSNError("Sony retornou um formato de resposta inesperado.") from None


class WindowsVault:
    """Windows DPAPI. Never writes plaintext tokens to disk."""
    def __init__(self, path: Path):
        self.path = path
        self._memory = None

    @staticmethod
    def _crypt(raw, protect):
        from ctypes import wintypes
        class Blob(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]
        buff = ctypes.create_string_buffer(raw) if protect else ctypes.create_string_buffer(raw, len(raw))
        blob_in = Blob(len(raw), ctypes.cast(buff, ctypes.POINTER(ctypes.c_byte)))
        blob_out = Blob()
        crypt = ctypes.windll.crypt32
        fn = crypt.CryptProtectData if protect else crypt.CryptUnprotectData
        if protect:
            ok = fn(ctypes.byref(blob_in), None, None, None, None, 0x1, ctypes.byref(blob_out))
        else:
            ok = fn(ctypes.byref(blob_in), None, None, None, None, 0x1, ctypes.byref(blob_out))
        if not ok:
            raise PSNError("Não foi possível usar a proteção do perfil Windows (DPAPI).")
        try:
            return ctypes.string_at(blob_out.pbData, blob_out.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)

    def save(self, tokens):
        if sys.platform != "win32":
            self._memory = dict(tokens)
            return
        payload = json.dumps(tokens).encode("utf-8")
        encrypted = self._crypt(payload, True)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_bytes(encrypted)
        os.replace(tmp, self.path)

    def load(self):
        if sys.platform != "win32":
            return self._memory
        if not self.path.exists():
            return None
        try:
            return json.loads(self._crypt(self.path.read_bytes(), False).decode("utf-8"))
        except Exception:
            # Fail closed: no plaintext fallback, never expose underlying blobs.
            return None

    def clear(self):
        self._memory = None
        self.path.unlink(missing_ok=True)

    @property
    def method(self):
        return "Windows DPAPI" if sys.platform == "win32" else "Apenas memória (não persiste)"


class PSNBridge:
    def __init__(self, data_dir: Path, ingest_callback, seen_callback, remember_callback):
        self.vault = WindowsVault(data_dir / "private_psn_tokens.dpapi")
        self.ingest_callback = ingest_callback
        self.seen_callback = seen_callback
        self.remember_callback = remember_callback
        self.lock = threading.Lock()
        self.connected = self.vault.load() is not None
        self.syncing = False
        self.auto = False
        self.last_sync = None
        self.last_error = None
        self.last_added = 0
        self.last_found = 0
        self.last_skipped = 0
        self.only_gta = True

    def state(self):
        return {"connected": bool(self.vault.load()), "syncing": self.syncing,
                "auto": self.auto, "storage": self.vault.method, "last_sync": self.last_sync,
                "last_error": self.last_error, "last_added": self.last_added,
                "last_found": self.last_found, "last_skipped": self.last_skipped,
                "only_gta": self.only_gta, "experimental": True}

    def connect(self, npsso):
        if not isinstance(npsso, str) or not re.fullmatch(r"[A-Za-z0-9_-]{24,256}", npsso.strip()):
            raise PSNError("Token Sony inválido. Copie somente o valor de npsso.")
        with self.lock:
            url = AUTH_BASE + "/authorize?" + urllib.parse.urlencode({
                "access_type": "offline", "client_id": CLIENT_ID,
                "redirect_uri": REDIRECT_URI, "response_type": "code", "scope": SCOPES,
            })
            status, headers, _ = http_json(url, headers={"Cookie": "npsso="+npsso.strip()}, no_redirect=True)
            if status != 302:
                raise PSNError("A Sony não aceitou a sessão de login.")
            location = headers.get("Location", "")
            parsed = urllib.parse.urlsplit(location)
            if parsed.scheme != "com.scee.psxandroid.scecompcall":
                raise PSNError("Redirecionamento de autenticação inesperado.")
            code = urllib.parse.parse_qs(parsed.query).get("code", [None])[0]
            if not code:
                raise PSNError("Não foi retornado um código de autorização.")
            tokens = self._token_request({"code":code, "grant_type":"authorization_code", "redirect_uri":REDIRECT_URI})
            self.vault.save(tokens)
            self.connected = True
            self.last_error = None
            return self.state()

    def _token_request(self, data):
        status, _, payload = http_json(AUTH_BASE+"/token", data=data, headers={
            "Authorization": CLIENT_AUTH,
            "Content-Type": "application/x-www-form-urlencoded",
        })
        if status != 200 or not isinstance(payload, dict) or not payload.get("access_token") or not payload.get("refresh_token"):
            raise PSNError("Sony retornou uma resposta de autenticação inesperada.")
        return {"access_token":payload["access_token"], "refresh_token":payload["refresh_token"],
                "expires_at":time.time()+int(payload.get("expires_in",3600))-60,
                "refresh_expires_at":time.time()+int(payload.get("refresh_token_expires_in",30*24*3600))-60}

    def _access_token(self):
        t = self.vault.load()
        if not t:
            raise PSNError("Conecte a conta PlayStation antes de sincronizar.")
        if time.time() > t.get("refresh_expires_at", 0):
            self.vault.clear()
            raise PSNError("A sessão PlayStation expirou. Conecte novamente.")
        if time.time() > t.get("expires_at",0):
            try:
                fresh = self._token_request({"token_format":"jwt", "refresh_token":t["refresh_token"],
                     "grant_type":"refresh_token", "scope": SCOPES})
                self.vault.save(fresh)
                return fresh["access_token"]
            except PSNError:
                # Preserve session on network failure. The user can retry.
                raise
        return t["access_token"]

    def disconnect(self):
        with self.lock:
            self.vault.clear()
            self.connected = False
            self.auto = False
            self.last_error = None
        return self.state()

    def set_options(self, auto=None, only_gta=None):
        with self.lock:
            if auto is not None:
                self.auto = bool(auto) and bool(self.vault.load())
            if only_gta is not None:
                self.only_gta = bool(only_gta)
        return self.state()

    @staticmethod
    def _cookies(headers):
        out = {}
        cookies = headers.get_all("Set-Cookie", []) if hasattr(headers, "get_all") else headers.get("Set-Cookie", [])
        if isinstance(cookies, str):
            cookies = [cookies]
        for line in cookies:
            for key in ("CloudFront-Key-Pair-Id", "CloudFront-Signature", "CloudFront-Policy"):
                m = re.match(r"^"+re.escape(key)+r"=([^;]+)",line)
                if m:
                    out[key] = m.group(1)
        if len(out)==3:
            return out
        return {}

    @staticmethod
    def _media_url(item, cookie):
        url = item.get("downloadUrl") or item.get("screenshotUrl") or item.get("largePreviewImage")
        if not isinstance(url,str) or not is_trusted_https(url):
            raise PSNError("Endereço de mídia inesperado; download bloqueado por segurança.")
        if cookie:
            keys = {"Key-Pair-Id":cookie["CloudFront-Key-Pair-Id"],
                    "Signature":cookie["CloudFront-Signature"], "Policy":cookie["CloudFront-Policy"]}
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(keys)
        return url

    @staticmethod
    def _download(url):
        if not is_trusted_https(url):
            raise PSNError("Download bloqueado: servidor externo não autorizado.")
        opener = urllib.request.build_opener(TrustedMediaRedirect())
        req = urllib.request.Request(url, headers={"User-Agent":"LeonidaLens/2.0"})
        try:
            with opener.open(req, timeout=35) as response:
                raw = response.read(MAX_SIZE+1)
        except (urllib.error.URLError, urllib.error.HTTPError):
            raise PSNError("Não foi possível baixar uma imagem da nuvem Sony.") from None
        if len(raw)>MAX_SIZE:
            raise PSNError("Captura excede 80 MB; importação interrompida.")
        if raw.startswith(b"\xff\xd8\xff"):
            ext=".jpg"
        elif raw.startswith(b"\x89PNG\r\n\x1a\n"):
            ext=".png"
        elif raw[:4]==b"RIFF" and raw[8:12]==b"WEBP":
            ext=".webp"
        else:
            raise PSNError("O arquivo recebido não é uma imagem JPG, PNG ou WEBP.")
        return raw,ext

    def sync(self):
        if not self.lock.acquire(blocking=False):
            raise PSNError("Já existe uma operação Sony em andamento.")
        try:
            self.syncing = True
            self.last_error = None
            added = found = skipped = 0
            bearer = self._access_token()
            cursor = None
            visited = set()
            for page in range(6):  # Rate/size guard: at most 180 recent items per sync.
                query = {"limit":30}
                if cursor:
                    query["cursorMark"] = cursor
                url = MEDIA_BASE + "?" + urllib.parse.urlencode(query)
                _, headers, data = http_json(url, headers={"Authorization":"Bearer "+bearer})
                if not isinstance(data,dict) or not isinstance(data.get("ugcDocument"),list):
                    raise PSNError("Formato de galeria PSN diferente do esperado. Pode ter mudado.")
                cookies = self._cookies(headers)
                for item in data["ugcDocument"]:
                    found += 1
                    if not isinstance(item,dict) or str(item.get("ugcType")) not in ("1", "screenshot"):
                        skipped += 1
                        continue
                    game = str(item.get("sceTitleName") or "")
                    if self.only_gta and not any(t in game.lower() for t in ("grand theft auto", "gta vi", "gta 6")):
                        skipped += 1
                        continue
                    media_id = str(item.get("id") or "")
                    upload_iso = str(item.get("uploadDate", "") or "")
                    if not media_id or self.seen_callback(media_id):
                        if media_id and upload_iso and getattr(self, "update_capture", None):
                            try:
                                self.update_capture(media_id, upload_iso)
                            except Exception:
                                pass
                        skipped += 1
                        continue
                    try:
                        url = self._media_url(item,cookies)
                        raw,ext = self._download(url)
                        date = str(item.get("uploadDate", ""))[:10]
                        safe_game = re.sub(r"[^a-zA-Z0-9_-]", "_", game)[:35]
                        name = f"{safe_game or 'PS5'}_{date}_{media_id[:16]}{ext}"
                        with tempfile.NamedTemporaryFile(suffix=ext,delete=False) as output:
                            tmp = Path(output.name)
                            output.write(raw)
                        try:
                            try:
                                pid,created = self.ingest_callback(tmp,name=name,captured_at=upload_iso)
                            except TypeError:  # callbacks antigos sem captured_at
                                pid,created = self.ingest_callback(tmp,name=name)
                        finally:
                            tmp.unlink(missing_ok=True)
                        self.remember_callback(media_id,pid,game,upload_iso or date)
                        added += int(created)
                    except PSNError:
                        # Failed media could be due to expired signed URLs; retry next sync.
                        skipped += 1
                cursor = data.get("nextCursorMark")
                if not cursor or cursor in visited:
                    break
                visited.add(cursor)
            self.last_sync = time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime())
            self.last_added = added
            self.last_found = found
            self.last_skipped = skipped
            return self.state()
        except PSNError as exc:
            self.last_error = str(exc)
            raise
        finally:
            self.syncing = False
            self.lock.release()
