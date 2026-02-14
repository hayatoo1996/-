(function () {
  'use strict';

  const STORAGE_KEY = 'task-app-data';

  // --- State ---
  let tasks = []; // array of root task objects
  let activeTimerTaskId = null;
  let timerInterval = null;

  // --- Data model ---
  // Task: { id, name, estimatedMinutes, actualSeconds, completed, collapsed, children: [] }

  function createTask(name, estimatedMinutes) {
    return {
      id: generateId(),
      name: name || '新しいタスク',
      estimatedMinutes: estimatedMinutes || 0,
      actualSeconds: 0,
      completed: false,
      collapsed: false,
      children: [],
    };
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // --- Persistence ---
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        tasks = JSON.parse(data);
      }
    } catch (e) {
      tasks = [];
    }
  }

  // --- Tree helpers ---
  function findTask(id, list) {
    for (const task of list) {
      if (task.id === id) return task;
      const found = findTask(id, task.children);
      if (found) return found;
    }
    return null;
  }

  function findParent(id, list, parent) {
    for (const task of list) {
      if (task.id === id) return parent;
      const found = findParent(id, task.children, task);
      if (found) return found;
    }
    return null;
  }

  function removeTask(id, list) {
    const idx = list.findIndex(t => t.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      return true;
    }
    for (const task of list) {
      if (removeTask(id, task.children)) return true;
    }
    return false;
  }

  function getTotalEstimatedMinutes(task) {
    if (task.children.length === 0) return task.estimatedMinutes;
    return task.children.reduce((sum, c) => sum + getTotalEstimatedMinutes(c), 0);
  }

  function getTotalActualSeconds(task) {
    if (task.children.length === 0) return task.actualSeconds;
    return task.children.reduce((sum, c) => sum + getTotalActualSeconds(c), 0);
  }

  function updateParentCompletion(taskId) {
    const parent = findParent(taskId, tasks, null);
    if (!parent) return;
    const allDone = parent.children.length > 0 && parent.children.every(c => c.completed);
    parent.completed = allDone;
    updateParentCompletion(parent.id);
  }

  // --- Time formatting ---
  function formatMinutes(mins) {
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return m + 'm';
    if (m === 0) return h + 'h';
    return h + 'h' + m + 'm';
  }

  function formatSeconds(secs) {
    if (secs <= 0) return '0m';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h === 0) return m + 'm';
    if (m === 0) return h + 'h';
    return h + 'h' + m + 'm';
  }

  // --- Timer ---
  function startTimer(taskId) {
    if (activeTimerTaskId) {
      stopTimer();
    }
    activeTimerTaskId = taskId;
    timerInterval = setInterval(function () {
      const task = findTask(activeTimerTaskId, tasks);
      if (task) {
        task.actualSeconds++;
        if (task.actualSeconds % 5 === 0) save();
        render();
      }
    }, 1000);
    render();
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    activeTimerTaskId = null;
    save();
    render();
  }

  // --- Rendering ---
  function render() {
    const listEl = document.getElementById('task-list');
    if (tasks.length === 0) {
      listEl.innerHTML = '<p class="empty-message">タスクがありません。「＋ 追加」で始めましょう。</p>';
    } else {
      listEl.innerHTML = '';
      tasks.forEach(function (task) {
        listEl.appendChild(renderTask(task));
      });
    }
    updateSummary();
  }

  function renderTask(task) {
    const el = document.createElement('div');
    el.className = 'task-item';
    el.dataset.id = task.id;

    const hasChildren = task.children.length > 0;
    const estMins = getTotalEstimatedMinutes(task);
    const actSecs = getTotalActualSeconds(task);
    const isTimerRunning = activeTimerTaskId === task.id;
    const isOverTime = actSecs > estMins * 60 && estMins > 0;

    const row = document.createElement('div');
    row.className = 'task-row';

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'task-toggle' + (hasChildren ? '' : ' no-children');
    toggleBtn.textContent = task.collapsed ? '▶' : '▼';
    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      task.collapsed = !task.collapsed;
      save();
      render();
    });

    // Checkbox
    const checkbox = document.createElement('button');
    checkbox.className = 'task-checkbox' + (task.completed ? ' checked' : '');
    checkbox.textContent = task.completed ? '✓' : '';
    checkbox.addEventListener('click', function (e) {
      e.stopPropagation();
      task.completed = !task.completed;
      setChildrenCompleted(task, task.completed);
      updateParentCompletion(task.id);
      if (task.completed && activeTimerTaskId === task.id) stopTimer();
      save();
      render();
    });

    // Info
    const info = document.createElement('div');
    info.className = 'task-info';
    info.addEventListener('click', function () {
      openEditModal(task.id);
    });

    const nameEl = document.createElement('div');
    nameEl.className = 'task-name' + (task.completed ? ' completed' : '');
    nameEl.textContent = task.name;

    const timeEl = document.createElement('div');
    timeEl.className = 'task-time';
    const timeText = formatSeconds(actSecs) + ' / ' + formatMinutes(estMins);
    if (isOverTime) {
      timeEl.innerHTML = '<span class="over">' + formatSeconds(actSecs) + '</span> / ' + formatMinutes(estMins);
    } else {
      timeEl.textContent = timeText;
    }

    info.appendChild(nameEl);
    info.appendChild(timeEl);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';

    // Timer button (only for leaf tasks)
    if (!hasChildren) {
      const timerBtn = document.createElement('button');
      timerBtn.className = 'btn-timer' + (isTimerRunning ? ' running' : '');
      timerBtn.textContent = isTimerRunning ? '⏹' : '▶';
      timerBtn.title = isTimerRunning ? '停止' : '開始';
      timerBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (isTimerRunning) {
          stopTimer();
        } else {
          startTimer(task.id);
        }
      });
      actions.appendChild(timerBtn);
    }

    // Add child button
    const addBtn = document.createElement('button');
    addBtn.textContent = '＋';
    addBtn.title = 'サブタスク追加';
    addBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openAddModal(task.id);
    });
    actions.appendChild(addBtn);

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete';
    delBtn.textContent = '✕';
    delBtn.title = '削除';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (confirm('「' + task.name + '」を削除しますか？')) {
        if (activeTimerTaskId === task.id) stopTimer();
        removeTask(task.id, tasks);
        updateParentCompletion(task.id);
        save();
        render();
      }
    });
    actions.appendChild(delBtn);

    row.appendChild(toggleBtn);
    row.appendChild(checkbox);
    row.appendChild(info);
    row.appendChild(actions);
    el.appendChild(row);

    // Children
    if (hasChildren) {
      const childContainer = document.createElement('div');
      childContainer.className = 'task-children' + (task.collapsed ? ' collapsed' : '');
      task.children.forEach(function (child) {
        childContainer.appendChild(renderTask(child));
      });
      el.appendChild(childContainer);
    }

    return el;
  }

  function setChildrenCompleted(task, completed) {
    task.children.forEach(function (c) {
      c.completed = completed;
      if (completed && activeTimerTaskId === c.id) stopTimer();
      setChildrenCompleted(c, completed);
    });
  }

  function updateSummary() {
    let totalEst = 0;
    let totalAct = 0;
    tasks.forEach(function (t) {
      totalEst += getTotalEstimatedMinutes(t);
      totalAct += getTotalActualSeconds(t);
    });
    document.getElementById('total-estimated').textContent = formatMinutes(totalEst);
    document.getElementById('total-actual').textContent = formatSeconds(totalAct);
  }

  // --- Modal ---
  let modalMode = null; // 'add' or 'edit'
  let modalTargetId = null;

  function openAddModal(parentId) {
    modalMode = 'add';
    modalTargetId = parentId; // null for root
    document.getElementById('modal-title').textContent = 'タスク追加';
    document.getElementById('modal-name').value = '';
    document.getElementById('modal-hours').value = '0';
    document.getElementById('modal-minutes').value = '0';
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-name').focus();
  }

  function openEditModal(taskId) {
    const task = findTask(taskId, tasks);
    if (!task) return;
    modalMode = 'edit';
    modalTargetId = taskId;
    document.getElementById('modal-title').textContent = 'タスク編集';
    document.getElementById('modal-name').value = task.name;
    document.getElementById('modal-hours').value = Math.floor(task.estimatedMinutes / 60);
    document.getElementById('modal-minutes').value = task.estimatedMinutes % 60;
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-name').focus();
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    modalMode = null;
    modalTargetId = null;
  }

  function saveModal() {
    const name = document.getElementById('modal-name').value.trim();
    if (!name) {
      document.getElementById('modal-name').focus();
      return;
    }
    const hours = parseInt(document.getElementById('modal-hours').value, 10) || 0;
    const minutes = parseInt(document.getElementById('modal-minutes').value, 10) || 0;
    const totalMinutes = hours * 60 + minutes;

    if (modalMode === 'add') {
      const newTask = createTask(name, totalMinutes);
      if (modalTargetId === null) {
        tasks.push(newTask);
      } else {
        const parent = findTask(modalTargetId, tasks);
        if (parent) {
          parent.collapsed = false;
          parent.children.push(newTask);
        }
      }
    } else if (modalMode === 'edit') {
      const task = findTask(modalTargetId, tasks);
      if (task) {
        task.name = name;
        task.estimatedMinutes = totalMinutes;
      }
    }

    save();
    closeModal();
    render();
  }

  // --- Export / Import ---
  function exportData() {
    const json = JSON.stringify(tasks, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tasks-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    toggleMenu(false);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data)) {
          if (confirm('現在のデータを置き換えますか？')) {
            if (activeTimerTaskId) stopTimer();
            tasks = data;
            save();
            render();
          }
        } else {
          alert('不正なデータ形式です。');
        }
      } catch (err) {
        alert('JSONの読み込みに失敗しました。');
      }
    };
    reader.readAsText(file);
    toggleMenu(false);
  }

  // --- Menu ---
  function toggleMenu(show) {
    const menu = document.getElementById('menu-dropdown');
    if (show === undefined) {
      menu.classList.toggle('hidden');
    } else {
      menu.classList.toggle('hidden', !show);
    }
  }

  // --- Event binding ---
  function init() {
    load();
    render();

    document.getElementById('btn-add-root').addEventListener('click', function () {
      openAddModal(null);
    });

    document.getElementById('btn-menu').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu();
    });

    document.getElementById('btn-export').addEventListener('click', exportData);

    document.getElementById('btn-import').addEventListener('click', function () {
      document.getElementById('file-import').click();
    });

    document.getElementById('file-import').addEventListener('change', function (e) {
      if (e.target.files.length > 0) {
        importData(e.target.files[0]);
        e.target.value = '';
      }
    });

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-save').addEventListener('click', saveModal);

    document.getElementById('modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });

    // Enter key in modal
    document.getElementById('modal-name').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveModal();
    });

    // Close menu on outside click
    document.addEventListener('click', function () {
      toggleMenu(false);
    });

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
