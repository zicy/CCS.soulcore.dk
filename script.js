// script.js – Command Cheat Sheet (legend removed for split‐border)
(() => {
  // ——— 1. LocalStorage keys ——————————————————
  const LS = {
    TAB: 'activeTab',      // last open tab
    GROUP: 'activeGroup',    // last open group
    CMD: 'activeCommand',  // last open command
    THEME: 'darkMode'        // dark/light mode
  };

  // ——— 2. Cached DOM nodes ——————————————————
  const tabBar = document.querySelector('.tab-bar');
  const tabContents = document.querySelector('.tab-contents');
  const searchInput = document.getElementById('globalSearch');
  const darkToggle = document.getElementById('darkToggle');
  const openEditor = document.getElementById('openEditor');
  const exportBtn = document.getElementById('exportJson');
  const modal = document.getElementById('editorModal');
  const closeModal = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelEditor');
  const titleEl = document.getElementById('editorTitle');
  const categorySelectDOM = document.getElementById('editorCategory');
  const addCategoryBtn = document.getElementById('addCategoryBtn');
  const groupSelectDOM = document.getElementById('editorGroup');
  const addGroupBtn = document.getElementById('addGroupBtn');
  const labelInput = document.getElementById('editorLabel');
  const descInput = document.getElementById('editorDescription');
  const templateInput = document.getElementById('editorTemplate');
  const varsField = document.getElementById('variablesFieldset');
  const form = document.getElementById('editorForm');

  // ——— 3. Application state ——————————————————
  let commands = {};                                 // loaded JSON data
  let activeTab = localStorage.getItem(LS.TAB) || 'admin';
  let activeGroup = localStorage.getItem(LS.GROUP) || null;
  let activeCmd = localStorage.getItem(LS.CMD) || null;
  let darkMode = localStorage.getItem(LS.THEME) === 'true';
  let editingCmd = null;                              // { tabId, groupId, commandId }

  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

  // ——— 4. Theme toggle ——————————————————————
  function applyTheme() {
    document.body.classList.toggle('dark', darkMode);
  }
  darkToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    localStorage.setItem(LS.THEME, darkMode);
    applyTheme();
  });

  // ——— 5. Template editor helpers ——————————
  function getTemplateText() {
    return templateInput.textContent;
  }
  function setTemplateText(str) {
    const esc = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = esc.replace(/\{[^}]+\}/g, tok =>
      `<span class="variable">${tok}</span>`
    );
    templateInput.innerHTML = html;
  }
  function saveCaretPosition(context) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    const pre = range.cloneRange();
    pre.selectNodeContents(context);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }
  function restoreCaretPosition(context, offset) {
    const range = document.createRange();
    let charIndex = 0, nodeStack = [context], node, found = false;
    while (nodeStack.length && !found) {
      node = nodeStack.shift();
      if (node.nodeType === 3) {
        const next = charIndex + node.length;
        if (offset <= next) {
          range.setStart(node, offset - charIndex);
          range.collapse(true);
          found = true;
        }
        charIndex = next;
      } else {
        for (let i = node.childNodes.length - 1; i >= 0; i--) {
          nodeStack.unshift(node.childNodes[i]);
        }
      }
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  templateInput.addEventListener('input', () => {
    const pos = saveCaretPosition(templateInput);
    setTemplateText(getTemplateText());
    restoreCaretPosition(templateInput, pos);
  });

  // ——— 6. Cleanup empty groups/categories —————
  function cleanupStructure() {
    Object.keys(commands).forEach(cat => {
      commands[cat].Groups = commands[cat].Groups.filter(g => g.commands.length);
      if (!commands[cat].Groups.length) delete commands[cat];
    });
  }

  // ——— 7. Populate Category & Group selects ————
  function populateCategoryList() {
    categorySelectDOM.innerHTML = '';
    Object.keys(commands).forEach(category => {
      const opt = document.createElement('option');
      opt.value = category;
      opt.textContent = capitalize(category);
      categorySelectDOM.appendChild(opt);
    });
  }
  function populateGroupList() {
    groupSelectDOM.innerHTML = '';
    const cat = categorySelectDOM.value;
    if (!commands[cat]) return;
    commands[cat].Groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      groupSelectDOM.appendChild(opt);
    });
  }

  // ——— 8. “➕” Add Category/Group handlers —————
  addCategoryBtn.addEventListener('click', () => {
    const name = prompt('Enter new category name:');
    if (!name) return;
    if (!commands[name]) commands[name] = { Groups: [] };
    //renderCommands();   // Not needed ?
    populateCategoryList();
    categorySelectDOM.value = name;
    groupSelectDOM.innerHTML = '';
  });
  addGroupBtn.addEventListener('click', () => {
    const cat = categorySelectDOM.value;
    if (!cat) return alert('Please select a category first.');
    const name = prompt('Enter new group name:');
    if (!name) return;
    const slug = name.replace(/\W+/g, '-').toLowerCase();
    const id = `${cat}-${slug}`;
    if (!commands[cat].Groups.find(g => g.id === id)) {
      commands[cat].Groups.push({ id, name, commands: [] });
    }
    populateGroupList();
    groupSelectDOM.value = id;
  });

  // ——— 9. Copy + flash effect ——————————————
  function copyAndFlash(elem, text) {
    navigator.clipboard.writeText(text);
    elem.classList.add('flash');
    setTimeout(() => elem.classList.remove('flash'), 300);
  }

  function updateCopyButtons(root = document) {
    //console.trace('Called from');

    // if root itself is a .command-block, just wrap it in an array:
    const commandBlocks = root.matches && root.matches('.command-block')
      ? [root]
      : root.querySelectorAll('.command-block');

    commandBlocks.forEach(det => {
      //console.log("updateCopyButtons | forEach commandBlocks");
      const inps = [...det.querySelectorAll('.var-input')];
      const valid = inps.every(i => i.checkValidity());
      const btn = det.querySelector('.copy-btn-inline');
      const codeEl = det.querySelector('.code-wrapper code');

      btn.disabled = !valid;
      btn.style.cursor = valid ? 'pointer' : 'not-allowed';
      codeEl.style.cursor = valid ? 'pointer' : 'not-allowed';
    });
  }

  // ——— 10. Update code blocks, badges & copy state —
  function updateAll(root = document) {
    //console.trace('Called from');
    
    // if root itself is a .command-block, just wrap it in an array:
    const commandBlocks = root.matches && root.matches('.command-block')
      ? [root]
      : root.querySelectorAll('.command-block');

    // rebuild code text
    commandBlocks.forEach(det => {
      //console.log("updateAll | forEach command-block - rebuild code text");
      let tmpl;
      const id = det.dataset.id;
      for (const { Groups } of Object.values(commands)) {
        for (const g of Groups) {
          const c = g.commands.find(x => x.id === id);
          if (c) tmpl = c.template;
        }
      }
      let out = tmpl;
      det.querySelectorAll('.var-input').forEach(inp => {
        const k = inp.placeholder;
        const reOpt = new RegExp(` ?\\{${k}\\?\\}`, 'g');
        const reReq = new RegExp(`\\{${k}\\}`, 'g');
        out = inp.value
          ? out.replace(reOpt, ' ' + inp.value).replace(reReq, inp.value)
          : out.replace(reOpt, '');
      });
      det.querySelector('code').textContent = out.trim();
    });

    // filter groups & update counts
    const term = searchInput.value.trim().toLowerCase();
    document.querySelectorAll('.command-group').forEach(grp => {
      //console.log("updateAll | forEach command-block - filter groups & update counts");
      const blocks = Array.from(grp.querySelectorAll('.command-block'));
      let match = 0;
      blocks.forEach(det => {
        const ok = !term || det.textContent.toLowerCase().includes(term);
        det.style.display = (grp.open && !ok) ? 'none' : '';
        if (ok) match++;
      });
      grp.querySelector('.group-count').textContent =
        term ? `${match}/${blocks.length}` : `${blocks.length}`;
    });

    // update tab badges
    document.querySelectorAll('.tab-button').forEach(btn => {
      //console.log("updateAll | forEach command-block - update tab badges");
      const tabId = btn.dataset.tab;
      const all = Array.from(document.querySelectorAll(
        `#${tabId} .command-block`
      ));
      const vis = all.filter(d => d.style.display !== 'none').length;
      let badge = btn.querySelector('.tab-count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tab-count';
        btn.appendChild(badge);
      }
      badge.textContent = term ? vis : all.length;
    });
  }

  // ——— 11. Build Tabs & Switch —————————————————
  function buildTabs() {
    tabBar.innerHTML = '';
    tabContents.innerHTML = '';
    Object.keys(commands).forEach(tabId => {
      const btn = document.createElement('button');
      btn.className = 'tab-button';
      btn.dataset.tab = tabId;
      btn.textContent = capitalize(tabId);
      btn.addEventListener('click', () => switchTab(tabId));
      tabBar.appendChild(btn);

      const sec = document.createElement('section');
      sec.className = 'tab-content';
      sec.id = tabId;
      tabContents.appendChild(sec);
    });
  }
  function switchTab(tabId) {
    activeTab = tabId;
    localStorage.setItem(LS.TAB, tabId);
    document.querySelectorAll('.tab-button').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tabId)
    );
    document.querySelectorAll('.tab-content').forEach(s => {
      s.id === tabId ? s.classList.add('active') : s.classList.remove('active');
    });
    updateAll();
  }

  // ——— 12. Render Groups & Commands ——————————
  function renderCommands() {
    buildTabs();
    Object.entries(commands).forEach(([tabId, { Groups }]) => {
      const container = document.getElementById(tabId);

      Groups.forEach(group => {
        // Group <details>
        const grp = document.createElement('details');
        grp.className = 'command-group';
        grp.dataset.id = group.id;
        if (group.id === activeGroup) grp.open = true;

        const sum = document.createElement('summary');
        sum.innerHTML = `<span>${group.name}</span><span class="group-count">0</span>`;
        sum.addEventListener('click', () => {
          document.querySelectorAll('.command-group')
            .forEach(g => g !== grp && (g.open = false));
          activeGroup = group.id;
          localStorage.setItem(LS.GROUP, group.id);
        });
        grp.appendChild(sum);

        // Commands
        group.commands.forEach(cmd => {
          const det = document.createElement('details');
          det.className = 'command-block';
          det.dataset.id = cmd.id;
          if (cmd.id === activeCmd) det.open = true;

          // Summary + edit icon
          const cs = document.createElement('summary');
          cs.style.display = 'flex';
          cs.style.justifyContent = 'space-between';
          cs.style.alignItems = 'center';

          const lbl = document.createElement('span');
          lbl.textContent = cmd.label;
          cs.appendChild(lbl);

          const editBtn = document.createElement('button');
          editBtn.className = 'edit-btn-inline';
          editBtn.title = 'Edit Command';
          editBtn.innerText = '✏️';
          editBtn.addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            openEditModal(tabId, group.id, cmd.id);
          });
          cs.appendChild(editBtn);

          cs.addEventListener('click', () => {
            document.querySelectorAll('.command-block')
              .forEach(c => c !== det && (c.open = false));
            activeCmd = cmd.id;
            localStorage.setItem(LS.CMD, cmd.id);
          });
          det.appendChild(cs);

          // Fieldset for opened content (no <legend>)
          const fieldset_dom = document.createElement('fieldset');
          fieldset_dom.className = 'command-fieldset';

          // Description
          if (cmd.description) {
            const md = document.createElement('div');
            md.className = 'description';
            md.innerHTML = cmd.description.replace(/`([^`]+)`/g, '<code>$1</code>');
            fieldset_dom.appendChild(md);
          }

          // Variable inputs
          Object.entries(cmd.variables || {}).forEach(([key, opt]) => {
            const hintEl = document.createElement('div');
            hintEl.className = 'hint';
            hintEl.textContent = opt.hint;
            fieldset_dom.appendChild(hintEl);

            const inp = document.createElement('input');
            inp.className = 'var-input';
            inp.placeholder = key;

            if (opt.value) inp.value = opt.value;
            if (opt.default_value && opt.default_value.trim() != '') inp.value = opt.default_value;

            if (opt.pattern) inp.pattern = opt.pattern;
            inp.addEventListener('input', () => {
              // Find my .command-block so that we do not need to check all in the DOM
              const myCommandBlock = inp.closest('.command-block');

              updateAll(myCommandBlock);
              updateCopyButtons(myCommandBlock)
              inp.title = inp.checkValidity() ? '' : inp.validationMessage;
            });
            inp.title = inp.checkValidity() ? '' : inp.validationMessage;
            fieldset_dom.appendChild(inp);
          });

          // Code + copy
          const commandBlock = document.createElement('div');
          commandBlock.className = 'code-wrapper';
          const codeEl = document.createElement('code');
          const copyButton = document.createElement('button');
          copyButton.className = 'copy-btn-inline';
          copyButton.title = 'Copy Command';

          copyButton.addEventListener('click', e => {
            e.stopPropagation();
            if ([...det.querySelectorAll('.var-input')].every(i => i.checkValidity())) {
              copyAndFlash(commandBlock, codeEl.textContent);
            }
          });
          commandBlock.addEventListener('click', () => {
            if ([...det.querySelectorAll('.var-input')].every(i => i.checkValidity())) {
              copyAndFlash(commandBlock, codeEl.textContent);
            }
          });

          commandBlock.appendChild(codeEl);
          commandBlock.appendChild(copyButton);
          fieldset_dom.appendChild(commandBlock);

          // Append and integrate
          det.appendChild(fieldset_dom);
          grp.appendChild(det);
        });

        container.appendChild(grp);
      });
    });

    switchTab(activeTab);
    applyTheme();
    updateAll();
  }

  // ——— 13. Modal: open/edit logic ——————————
  openEditor.addEventListener('click', e => {
    e.preventDefault();
    editingCmd = null;
    const defaultGrp = activeGroup || commands[activeTab]?.Groups[0]?.id || '';
    openEditModal(activeTab, defaultGrp, null);
  });
  closeModal.addEventListener('click', () => modal.style.display = 'none');
  cancelBtn.addEventListener('click', () => modal.style.display = 'none');

  function openEditModal(tabId, groupId, commandId = null) {
    editingCmd = { tabId, groupId, commandId };
    titleEl.textContent = commandId ? 'Edit Command' : 'Add Command';

    // Category & Group selects
    populateCategoryList();
    categorySelectDOM.value = tabId;
    categorySelectDOM.onchange = populateGroupList;
    populateGroupList();
    groupSelectDOM.value = groupId || '';

    // Prefill fields
    labelInput.value = commandId
      ? commands[tabId].Groups.find(g => g.id === groupId)
        .commands.find(c => c.id === commandId).label
      : '';
    descInput.value = commandId
      ? commands[tabId].Groups.find(g => g.id === groupId)
        .commands.find(c => c.id === commandId).description
      : '';
    setTemplateText(
      commandId
        ? commands[tabId].Groups.find(g => g.id === groupId)
          .commands.find(c => c.id === commandId).template
        : ''
    );

    // Variables area
    varsField.innerHTML = '<legend>Variables +</legend>';
    const legend = varsField.querySelector('legend');
    legend.style.cursor = 'pointer';
    legend.title = 'Add Variable';
    legend.onclick = () => addVariableRow();

    if (commandId) {
      const cmd = commands[tabId].Groups.find(g => g.id === groupId).commands.find(c => c.id === commandId);
      Object.entries(cmd.variables || {}).forEach(([k, opt]) =>
        addVariableRow(k, opt.hint, opt.pattern || '', opt.default_value || '', opt.optional)
      );
    } else {
      form.reset();
    }

    modal.style.display = 'block';
  }

  // ——— 14. Add variable row ——————————————————
  function addVariableRow(name = '', hint = '', pattern = '', defaultValue = '', optional = false) {
    const row = document.createElement('div');
    row.className = 'variable-row';
    row.innerHTML = `
      <input class="var-input" placeholder="name" required value="${name}">
      <label class="var-optional-label">
        <input type="checkbox" class="var-optional"${optional ? ' checked' : ''}/> Optional
      </label>
      <input class="var-input" placeholder="hint" value="${hint}">
      <input class="var-input" placeholder="pattern" value="${pattern}">
      <input class="var-input" placeholder="Default value" value="${defaultValue}">
      <button type="button" class="insert-btn">⇨</button>
      <button type="button" class="remove-var">🗑️</button>
    `;
    varsField.appendChild(row);

    const nameFld = row.querySelector('input[placeholder="name"]');
    const optChk = row.querySelector('.var-optional');
    const insBtn = row.querySelector('.insert-btn');
    const delBtn = row.querySelector('.remove-var');

    // Handle insertion at caret or append
    insBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const variableName = nameFld.value.trim();
      if (!variableName) return;
      const placeholder = `{${variableName}${optChk.checked ? '?' : ''}}`;
      if (document.activeElement === templateInput) {
        const offset = saveCaretPosition(templateInput);
        document.execCommand('insertText', false, placeholder);
        setTemplateText(getTemplateText());
        restoreCaretPosition(templateInput, offset + placeholder.length);
      } else {
        const curr = getTemplateText();
        setTemplateText((curr + ' ' + placeholder).trim());
      }
    });

    // Handle delete
    delBtn.addEventListener('click', () => {
      const variableName = nameFld.value.trim();
      const re = new RegExp(` ?\\{${variableName}\\??\\}`, 'g');
      setTemplateText(getTemplateText().replace(re, '').trim());
      row.remove();
    });
  }

  // ——— 15. Save (Add/Edit) command ——————————
  form.addEventListener('submit', e => {
    e.preventDefault();
    const cat = categorySelectDOM.value.trim();
    if (!commands[cat]) commands[cat] = { Groups: [] };

    let commandGroup = commands[cat].Groups.find(g => g.id === groupSelectDOM.value);
    if (!commandGroup) {
      const name = prompt('Enter new group name:');
      const slug = name.replace(/\W+/g, '-').toLowerCase();
      commandGroup = { id: `${cat}-${slug}`, name, commands: [] };
      commands[cat].Groups.push(commandGroup);
    }

    const label = labelInput.value.trim();
    const desc = descInput.value.trim();
    const tpl = getTemplateText().trim();

    const vars = {};
    varsField.querySelectorAll('.variable-row').forEach(r => {
      const name = r.querySelector('input[placeholder="name"]').value.trim();
      const optional = r.querySelector('.var-optional').checked;
      const hint = r.querySelector('input[placeholder="hint"]').value.trim();
      const pattern = r.querySelector('input[placeholder="pattern"]').value.trim();
      const defaultValue = r.querySelector('input[placeholder="Default value"]').value.trim();
      if (name) vars[name] = { value: '', hint: hint, pattern: pattern, default_value: defaultValue, optional: optional };
    });

    if (editingCmd && editingCmd.commandId) {
      const oldGrp = commands[editingCmd.tabId].Groups
        .find(g => g.id === editingCmd.groupId);
      const cmd = oldGrp.commands.find(c => c.id === editingCmd.commandId);
      cmd.label = label;
      cmd.description = desc;
      cmd.template = tpl;
      cmd.variables = vars;
      if (editingCmd.tabId !== cat || editingCmd.groupId !== commandGroup.id) {
        oldGrp.commands = oldGrp.commands.filter(c => c.id !== cmd.id);
        commandGroup.commands.push(cmd);
      }
    } else {
      const newId = `${cat}-${commandGroup.id}-${label.replace(/\W+/g, '')}`.toLowerCase();
      commandGroup.commands.push({ id: newId, label, description: desc, template: tpl, variables: vars });
    }

    cleanupStructure();
    renderCommands();
    modal.style.display = 'none';
    editingCmd = null;
  });

  // ——— 16. Export JSON ————————————————————
  exportBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(commands, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'commands.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // ——— 17. Live Search ————————————————————
  searchInput.addEventListener('input', updateAll);

  // ——— 18. Initial Fetch & Bootstrap ——————
  fetch('commands.json')
    .then(r => r.json())
    .then(data => {
      commands = data;
      renderCommands();
    });

})();
