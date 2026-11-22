"""Build an installable ZIP with manifest.json at its root."""
import json
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

workspace = Path(__file__).resolve().parent.parent
source = workspace / 'extension book'
manifest = json.loads((source / 'manifest.json').read_text(encoding='utf-8'))
archive = workspace / f"VTPATE-extension-{manifest['version']}.zip"
with ZipFile(archive, 'w', ZIP_DEFLATED) as package:
    for file in sorted(source.rglob('*')):
        if file.is_file():
            package.write(file, file.relative_to(source).as_posix())

with ZipFile(archive) as package:
    assert package.testzip() is None, 'Corrupt ZIP entry'
    packaged = json.loads(package.read('manifest.json'))
    assert packaged == manifest
    required = [manifest['background']['service_worker'], manifest['action']['default_popup'], *manifest['icons'].values()]
    for name in required:
        assert name in package.namelist(), f'Missing manifest resource: {name}'
    for name in ['manager.html', manifest['action']['default_popup']]:
        html = package.read(name).decode('utf-8')
        for reference in re.findall(r'<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"', html):
            target = (source / Path(name).parent / reference).resolve()
            relative = target.relative_to(source.resolve()).as_posix()
            assert relative in package.namelist(), f'Missing UI resource: {relative}'
print(f'PASS: {archive} ({archive.stat().st_size} bytes); root manifest and packaged resources verified.')
