import json,os,io,sys
import sc
SRC=os.path.join(os.path.dirname(os.path.abspath(__file__)),'src')
files=[]
for n in sorted(os.listdir(SRC)):
    p=os.path.join(SRC,n)
    src=io.open(p,encoding='utf-8').read()
    if n=='appsscript.json':
        files.append({'name':'appsscript','type':'JSON','source':src})
    elif n.endswith('.gs'):
        files.append({'name':n[:-3],'type':'SERVER_JS','source':src})
res=sc.api('/content','PUT',{'files':files})
print('올림', len(res['files']), '개')
