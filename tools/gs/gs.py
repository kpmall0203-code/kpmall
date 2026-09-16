import json,os,time,urllib.request,urllib.parse,urllib.error
D=os.path.dirname(os.path.abspath(__file__))   # client_secret.json · token.json 은 이 폴더에 (저장소엔 안 넣는다)
SS='1Dk4RGpxBdCVhkuMK1TEJRMeQ2ViwMtJlo3l4twmut00'
_c=json.load(open(f'{D}/client_secret.json'))['installed']
_t=json.load(open(f'{D}/token.json'))

def _tok():
    global _t
    if _t.get('_exp',0) > time.time()+60: return _t['access_token']
    body=urllib.parse.urlencode({'client_id':_c['client_id'],'client_secret':_c['client_secret'],
        'refresh_token':_t['refresh_token'],'grant_type':'refresh_token'}).encode()
    r=json.load(urllib.request.urlopen(urllib.request.Request(_c['token_uri'],data=body)))
    _t.update(r); _t['_exp']=time.time()+r.get('expires_in',3600)
    json.dump(_t,open(f'{D}/token.json','w'))
    return _t['access_token']

def api(path,method='GET',body=None,**q):
    url=f'https://sheets.googleapis.com/v4/spreadsheets/{SS}{path}'
    if q: url+=('&' if '?' in url else '?')+urllib.parse.urlencode(q,doseq=True)
    req=urllib.request.Request(url,method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization':'Bearer '+_tok(),'Content-Type':'application/json'})
    try: return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e: raise SystemExit(f'HTTP {e.code}: {e.read().decode()[:800]}')

def read(rng): return api(f'/values/{urllib.parse.quote(rng)}').get('values',[])
def write(rng,vals): return api(f'/values/{urllib.parse.quote(rng)}','PUT',
    {'values':vals},valueInputOption='USER_ENTERED')
def append(rng,vals): return api(f'/values/{urllib.parse.quote(rng)}:append','POST',
    {'values':vals},valueInputOption='USER_ENTERED',insertDataOption='INSERT_ROWS')
def batch(reqs): return api(':batchUpdate','POST',{'requests':reqs})
