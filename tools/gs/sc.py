import json,os,sys,urllib.request,urllib.error
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import gs
SCRIPT_ID='1bfe6yklrT_KPjYznBDT4_InHZBY7SionvWaj5e9B9UIAa27ORfozew9I'
def api(path,method='GET',body=None):
    req=urllib.request.Request(f'https://script.googleapis.com/v1/projects/{SCRIPT_ID}{path}',
        method=method, data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization':'Bearer '+gs._tok(),'Content-Type':'application/json'})
    try: return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e: raise SystemExit(f'HTTP {e.code}: {e.read().decode()[:900]}')
