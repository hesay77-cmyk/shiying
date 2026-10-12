// 拾影：常用下载页保持简洁，原有高级能力仍可展开。
document.body.classList.add('shiying-tool');
const heading = document.createElement('header');
heading.className = 'shiying-tool-heading';
const logo = document.createElement('img');
logo.src = 'img/shiying.svg'; logo.alt = ''; logo.width = 42; logo.height = 42;
const title = document.createElement('div');
const name = document.createElement('h1'); name.textContent = '拾影 · 视频下载';
const source = document.createElement('p');
source.textContent = new URLSearchParams(location.search).get('title') || '请保持这个页面打开，下载进度会显示在这里。';
title.append(name, source);
const advanced = document.createElement('button');
advanced.textContent = '显示高级选项';
advanced.setAttribute('aria-pressed','false');
advanced.addEventListener('click', () => {
    const open = document.body.classList.toggle('advanced');
    advanced.textContent = open ? '收起高级选项' : '显示高级选项';
    advanced.setAttribute('aria-pressed',String(open));
});
heading.append(logo,title,advanced);
document.body.prepend(heading);
