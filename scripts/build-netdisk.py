"""Build the local-only AGPL adapter from the exact, retained LinkSwift 1.1.3 source."""
from pathlib import Path
import hashlib, re

root = Path(__file__).resolve().parent.parent
source = root / 'third-party-source/LinkSwift-1.1.3.user.js'
assert hashlib.sha256(source.read_bytes()).hexdigest() == '840a753c3e3c3becb5f4f4e46ba0f900c3ca44c1d640aafd0666732adeab417e'
text = source.read_text(encoding='utf-8')
lines = text.splitlines()
objects, current = {}, None
for i, line in enumerate(lines):
    match = re.match(r'\tlet (\$?[\w]+) = \{', line)
    if match:
        current = match[1]
        objects[current] = {}
    match = re.match(r'\t\t(?:async )?([\w]+)\([^\n]*\) \{', line)
    if match and current:
        end = next(j for j in range(i+1, len(lines)) if re.fullmatch(r'\t\t},?', lines[j]))
        objects[current][match[1]] = '\n'.join(lines[i:end+1])

providers = ['$baidu', '$aliyun', '$mcloud', '$tcloud', '$xunlei', '$quark', '$uc', '$123pan']
omit = {'addPageListener', 'greenerPage', 'beautifyPage', 'addButton', 'addInitButton', 'initPanLinker'}
parts = []
for name in providers:
    methods = [body for key, body in objects[name].items() if key not in omit and not (name == '$baidu' and key == 'getToken')]
    if name == '$baidu':
        # Keep the share-sign query intact: an ampersand starts bdstoken, not a dollar sign.
        # Youth /youth/pan/main — treat like home/main for downloads.
        methods = [body.replace(
            'if (temp.page === "home" || temp.page === "main")',
            'if (temp.page === "home" || temp.page === "main" || temp.page === "youth")'
        ) for body in methods]
        methods = [body.replace('$bdstoken=${', '&bdstoken=${') for body in methods]
    if name == '$123pan':
        # The public 123 share page now uses a CSS-module table shell with the same row props.
        methods = [body.replace('.ant-table-wrapper, .tiled-list, .file-list, .single-file-sharing-container-content', '.ant-table-wrapper, .tiled-list, .file-list, .single-file-sharing-container-content, [class*=table-module__shell]') for body in methods]
        # Preserve the server's actual reason; code 5112 is also used for the sharer's quota.
        methods = [body.replace('message.error("提示：<br/>请先登录网盘后再获取链接呢~")', 'message.error(res?.message || "请先登录网盘后再获取链接")') for body in methods]
        methods = [body.replace('"Authorization": `Bearer ${token}`', '...(token ? {"Authorization": `Bearer ${token}`} : {})') for body in methods]
    parts.append('const ' + name + ' = {\n' + '\n'.join(methods) + '\n};')
helpers = '\n'.join(objects['base'][name] for name in ['isType', 'encodeBase', 'decodeBase', 'stringify', 'findReact'])
configuration = text[text.index('\tlet config = {'):text.index('\tlet base = {')]
template = (root / 'scripts/netdisk-page.template.js').read_text(encoding='utf-8')
for marker, content in [('CONFIGURATION', configuration), ('ADAPTERS', '\n'.join(parts)), ('HELPERS', helpers)]:
    token = '/*LINKSWIFT_' + marker + '*/'
    assert template.count(token) == 1
    template = template.replace(token, content)
assert 'GM_xmlhttpRequest' not in template
(root / 'js/shiying-netdisk-adapters.js').write_text(template, encoding='utf-8')
print('Built eight local adapters:', len(template.encode('utf-8')), 'bytes')
