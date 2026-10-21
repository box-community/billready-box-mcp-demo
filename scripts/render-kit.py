from pathlib import Path
import subprocess, os, json
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent.parent
out=root/'verification/pdf'
out.mkdir(parents=True,exist_ok=True)
pdfs=sorted((root/'demo-kit/upload-to-box').rglob('*.pdf'))+[root/'demo-kit/presenter-only/CW-101-signed-acceptance.pdf']
records=[]
env=dict(os.environ,XDG_CACHE_HOME='/private/tmp/billready-render-cache')
for i,pdf in enumerate(pdfs):
    prefix=out/f'source-{i+1:02d}'
    subprocess.run(['pdftoppm','-png','-scale-to','650','-singlefile',str(pdf),str(prefix)],check=True,env=env,capture_output=True)
    info=subprocess.check_output(['pdfinfo',str(pdf)],text=True)
    pages=int(next(x.split(':')[1] for x in info.splitlines() if x.startswith('Pages:')))
    if pages!=1: raise RuntimeError(f'Unexpected source page count: {pdf}: {pages}')
    records.append({'path':str(pdf.relative_to(root)),'pages':pages,'render':str(prefix.with_suffix('.png').relative_to(root))})
for batch in range(0,len(records),8):
    group=records[batch:batch+8]
    sheet=Image.new('RGB',(1440,1020),'#e7e9e3');draw=ImageDraw.Draw(sheet)
    for j,rec in enumerate(group):
        img=Image.open(root/rec['render']).convert('RGB');img.thumbnail((340,460))
        x=10+(j%4)*360;y=10+(j//4)*510
        sheet.paste(img,(x,y))
        draw.text((x,y+465),Path(rec['path']).name[:42],fill='#203a30')
    sheet.save(out/f'contact-sheet-{batch//8+1}.png')
(out/'render-manifest.json').write_text(json.dumps(records,indent=2))
print(f'Rendered and page-count checked {len(records)} PDFs into {out}')
