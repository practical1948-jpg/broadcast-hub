/**
 * 방송 업무 대시보드 - Supabase Realtime CRUD Engine
 */
const SUPABASE_URL = 'https://jesxwfrsuaolmgzgcthb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Implc3h3ZnJzdWFvbG1nemdjdGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTEzMDgsImV4cCI6MjA4NTE2NzMwOH0.ABmvmjQKIlNNot1TioEJhboKvn339tWXN5UgeAGqIe0';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

class TeamLeaderDashboard {
    constructor() {
        this.duties = [];
        this.trash = [];
        this.editingDutyId = null;
        this.currentMode = 'view';
        this.activeFilter = 'day';

        // 영문 카테고리 정비 및 아이콘 매핑
        this.categoryIcons = {
            'Director': 'shield-check',
            'ProPresenter': 'monitor',
            'OBS': 'cast',
            'Atem/Cam/Light': 'camera',
            'Youtube': 'youtube',
            'Worship Team': 'music',
            'Media': 'video',
            'Etc': 'info'
        };

        // 데이터 마이그레이션 및 동기화 맵
        this.categoryLegacyMap = {
            'Director': 'Director',
            'System': 'Director',
            '방송실': 'Director',
            '프프': 'ProPresenter',
            'ProPresenter': 'ProPresenter',
            'OBS': 'OBS',
            'ATEM': 'Atem/Cam/Light',
            'Atem/Cam/Light': 'Atem/Cam/Light',
            'Youtube': 'Youtube',
            'Media': 'Media',
            '미디어': 'Media',
            '기타': 'Etc',
            'Etc': 'Etc'
        };

        this.categoryClassMap = {
            'Director': 'badge-room',
            'ProPresenter': 'badge-propresenter',
            'OBS': 'badge-obs',
            'Atem/Cam/Light': 'badge-atem',
            'Youtube': 'badge-youtube',
            'Worship Team': 'badge-worship',
            'Media': 'badge-media',
            'Etc': 'badge-etc'
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadInitialData();
        this.setupRealtimeSubscription();
        lucide.createIcons();
    }

    async loadInitialData() {
        try {
            // Duties 로드
            const { data: duties, error: dError } = await _supabase
                .from('duties')
                .select('*')
                .order('created_at', { ascending: true });

            if (dError) throw dError;
            this.duties = duties || [];

            // Trash 로드
            const { data: trash, error: tError } = await _supabase
                .from('trash')
                .select('*')
                .order('deleted_at', { ascending: false });

            if (tError) throw tError;
            this.trash = trash || [];

            this.render();

            // 휴지통 모달이 열려있다면 휴지통 목록도 갱신
            if (document.getElementById('trashModal').classList.contains('active')) {
                this.renderTrash();
            }
        } catch (err) {
            console.error('Error loading data:', err.message);
            const container = document.getElementById('teamLeaderDashboard');
            container.innerHTML = `
                <div style="padding: 40px; text-align: center; color: var(--notion-red);">
                    <i data-lucide="wifi-off" style="width:48px;height:48px;margin-bottom:16px;opacity:0.5;"></i>
                    <div style="font-size: 16px; font-weight: 600;">데이터를 가져오지 못했습니다.</div>
                    <div style="font-size: 13px; margin-top: 8px; opacity: 0.7;">인터넷 연결을 확인하거나 잠시 후 다시 시도해주세요.</div>
                </div>
            `;
            lucide.createIcons();
        }
    }

    setupRealtimeSubscription() {
        // Duties 테이블 변화 감지
        _supabase
            .channel('public:duties')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'duties' }, async () => {
                await this.loadInitialData();
            })
            .subscribe();

        // Trash 테이블 변화 감지
        _supabase
            .channel('public:trash')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trash' }, async () => {
                await this.loadInitialData();
            })
            .subscribe();
    }

    setupEventListeners() {
        document.getElementById('addDutyBtn').addEventListener('click', () => this.showModal('dutyModal', 'edit'));
        document.getElementById('openTrashBtn').addEventListener('click', () => this.showModal('trashModal'));
        document.getElementById('dutyForm').addEventListener('submit', (e) => this.handleFormSubmit(e));

        // 시간 입력 자동 포맷팅
        const timeInput = document.getElementById('dutyTime');
        timeInput.addEventListener('input', (e) => this.formatTimeInput(e.target));
        timeInput.addEventListener('blur', (e) => this.finalTimeFormat(e.target));
    }

    formatTimeInput(input) {
        // 숫자만 남기기
        let value = input.value.replace(/\D/g, '').substring(0, 4);

        if (value.length >= 3) {
            value = value.substring(0, 2) + ':' + value.substring(2);
        }

        input.value = value;
    }

    finalTimeFormat(input) {
        let value = input.value.replace(/\D/g, '');
        if (value.length === 0) return;

        // 3자리 입력 시 (예: 912 -> 09:12)
        if (value.length === 3) {
            value = '0' + value;
        }

        // 4자리 완성 (예: 1234 -> 12:34)
        if (value.length === 4) {
            const hh = value.substring(0, 2);
            const mm = value.substring(2);
            // 시간 범위 체크 (00~23, 00~59)
            const validHH = Math.min(23, parseInt(hh)).toString().padStart(2, '0');
            const validMM = Math.min(59, parseInt(mm)).toString().padStart(2, '0');
            input.value = `${validHH}:${validMM}`;
        }
    }

    async handleFormSubmit(e) {
        e.preventDefault();

        // 최종 시간 포맷 확인 (예: 0912를 그대로 저장하려 할 때 대비)
        const timeInput = document.getElementById('dutyTime');
        this.finalTimeFormat(timeInput);

        const formData = {
            category: document.getElementById('dutyCategory').value,
            day: document.getElementById('dutyDay').value,
            time: timeInput.value,
            title: document.getElementById('dutyTitle').value,
            description: document.getElementById('dutyDescription').value,
            notion_link: document.getElementById('dutyNotionLink').value,
            assignee: document.getElementById('dutyAssignee').value
        };

        try {
            if (this.editingDutyId) {
                // Update
                const { error } = await _supabase
                    .from('duties')
                    .update(formData)
                    .eq('id', this.editingDutyId);
                if (error) throw error;
            } else {
                // Create
                const { error } = await _supabase
                    .from('duties')
                    .insert([formData]);
                if (error) throw error;
            }

            this.hideModal('dutyModal');
            await this.loadInitialData(); // 즉시 갱신
        } catch (err) {
            alert('저장 실패: ' + err.message);
        }
    }

    async deleteDuty(id) {
        if (!confirm('업무를 휴지통으로 이동할까요?')) return;

        try {
            const duty = this.duties.find(d => d.id === id);
            if (!duty) return;

            // 1. Trash 테이블에 삽입 (필요한 필드만 명시)
            const trashData = {
                category: duty.category,
                day: duty.day,
                time: duty.time,
                title: duty.title,
                description: duty.description,
                notion_link: duty.notion_link,
                assignee: duty.assignee,
                deleted_at: new Date()
            };

            const { error: tError } = await _supabase
                .from('trash')
                .insert([trashData]);

            if (tError) throw tError;

            // 2. Duties 테이블에서 삭제
            const { error: dError } = await _supabase
                .from('duties')
                .delete()
                .eq('id', id);

            if (dError) throw dError;

            this.hideModal('dutyModal');
            await this.loadInitialData(); // 즉시 갱신
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        }
    }

    async restoreDuty(id) {
        try {
            const duty = this.trash.find(d => d.id === id);
            if (!duty) return;

            // 1. Duties 테이블에 복구 (필요한 필드만 명시)
            const restoreData = {
                category: duty.category,
                day: duty.day,
                time: duty.time,
                title: duty.title,
                description: duty.description,
                notion_link: duty.notion_link,
                assignee: duty.assignee
            };

            const { error: dError } = await _supabase
                .from('duties')
                .insert([restoreData]);

            if (dError) throw dError;

            // 2. Trash 테이블에서 삭제
            const { error: tError } = await _supabase
                .from('trash')
                .delete()
                .eq('id', id);

            if (tError) throw tError;
            await this.loadInitialData(); // 즉시 갱신
        } catch (err) {
            alert('복구 실패: ' + err.message);
        }
    }

    async permanentlyDelete(id) {
        if (!confirm('완전히 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

        try {
            const { error } = await _supabase
                .from('trash')
                .delete()
                .eq('id', id);
            if (error) throw error;
            await this.loadInitialData(); // 즉시 갱신
        } catch (err) {
            alert('삭제 실패: ' + err.message);
        }
    }

    changeFilter(filter) {
        this.activeFilter = filter;
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtnId = filter === 'day' ? 'filterDay' : (filter === 'category' ? 'filterCategory' : 'filterService');
        document.getElementById(activeBtnId).classList.add('active');
        this.render();
    }

    render() {
        const container = document.getElementById('teamLeaderDashboard');
        container.innerHTML = '';

        if (this.activeFilter === 'day') {
            this.renderByDay(container);
        } else if (this.activeFilter === 'category') {
            this.renderByCategory(container);
        } else {
            this.renderServiceHighlight(container);
        }
        lucide.createIcons();
    }

    renderByDay(container) {
        const days = ['화요일', '수요일', '목요일', '금요일', '토요일', '주일'];
        days.forEach(day => {
            const dayDuties = this.duties.filter(d => d.day === day)
                .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

            const icon = (day === '주일' || day === '목요일') ? 'calendar-days' : 'calendar';
            this.renderSection(container, day, icon, dayDuties, true);
        });
    }

    renderByCategory(container) {
        const categories = Object.keys(this.categoryIcons);
        categories.forEach(cat => {
            const catDuties = this.duties.filter(d => d.category === cat)
                .sort((a, b) => a.day.localeCompare(b.day));

            this.renderSection(container, cat, this.categoryIcons[cat], catDuties, false);
        });
    }

    renderServiceHighlight(container) {
        const serviceDays = ['목요일', '주일'];
        serviceDays.forEach(day => {
            const dayDuties = this.duties.filter(d => d.day === day)
                .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

            const section = document.createElement('div');
            section.className = 'notion-section highlight-service';

            const title = document.createElement('div');
            title.className = 'notion-section-title';
            title.innerHTML = `<i data-lucide="zap" style="width:18px;height:18px"></i> ${day} 예배 업무 [예배]`;
            section.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'notion-grid';

            if (dayDuties.length === 0) {
                grid.innerHTML = '<div style="padding: 15px; color: var(--notion-meta-text); font-size: 13px;">일정 없음</div>';
            } else {
                dayDuties.forEach(duty => this.createDutyItem(grid, duty, false));
            }

            section.appendChild(grid);
            container.appendChild(section);
        });
    }

    renderSection(container, label, icon, items, showDayInTitle) {
        const section = document.createElement('div');
        section.className = 'notion-section';
        const highlights = ['목요일', '주일'];
        if (highlights.includes(label)) section.classList.add('highlight-service');

        const title = document.createElement('div');
        title.className = 'notion-section-title';
        title.innerHTML = `<i data-lucide="${icon}" style="width:16px;height:16px"></i> ${label}`;
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'notion-grid';

        if (items.length === 0) {
            grid.innerHTML = '<div style="padding: 10px 14px; color: var(--notion-meta-text); font-size: 13px;">일정 없음</div>';
        } else {
            items.forEach(duty => this.createDutyItem(grid, duty, !showDayInTitle));
        }

        section.appendChild(grid);
        container.appendChild(section);
    }

    createDutyItem(container, duty, showDay) {
        const item = document.createElement('div');
        item.className = 'notion-item';
        item.onclick = () => this.showModal('dutyModal', 'view', duty.id);

        const badge = this.categoryClassMap[duty.category] || 'badge-etc';
        const icon = this.categoryIcons[duty.category] || 'info';

        item.innerHTML = `
            <div class="notion-item-content">
                <div class="notion-item-time">${duty.time || '--:--'}</div>
                <div class="notion-item-icon"><i data-lucide="${icon}" style="width:18px;height:18px"></i></div>
                <div class="notion-badge ${badge}" style="opacity: 0.8; flex-shrink: 0;">${duty.category || 'Etc'}</div>
                <div class="notion-item-title">
                    ${showDay ? `[${duty.day || ''}] ` : ''}${duty.title || 'No Title'}
                    ${duty.assignee ? `<span style="font-size: 11px; margin-left: 8px; opacity: 0.5; color: #fff;">(${duty.assignee})</span>` : ''}
                </div>
            </div>
            <div class="duty-actions-inline">
                ${duty.notion_link ? `
                    <div class="direct-notion-btn" onclick="event.stopPropagation(); window.open('${duty.notion_link}', '_blank')">
                        <i data-lucide="external-link" style="width:14px;height:14px"></i>
                    </div>` : ''}
            </div>
        `;
        container.appendChild(item);
    }

    showModal(modalId, forcedMode = null, dutyId = null) {
        const modal = document.getElementById(modalId);
        if (modalId === 'dutyModal') {
            this.editingDutyId = dutyId;
            const duty = dutyId ? this.duties.find(d => d.id === dutyId) : null;

            if (forcedMode) {
                this.setModalMode(forcedMode);
            } else {
                this.setModalMode(dutyId ? 'view' : 'edit');
            }

            if (this.currentMode === 'view' && duty) {
                this.fillViewModal(duty);
            } else {
                this.fillEditModal(duty);
            }
        } else if (modalId === 'trashModal') {
            this.renderTrash();
        }

        modal.classList.add('active');
    }

    setModalMode(mode) {
        const modal = document.getElementById('dutyModal');
        this.currentMode = mode;
        modal.classList.remove('view-mode', 'edit-mode');
        modal.classList.add(mode + '-mode');
    }

    fillViewModal(duty) {
        document.getElementById('viewCategoryBadge').innerText = duty.category;
        document.getElementById('viewCategoryBadge').className = 'notion-badge ' + (this.categoryClassMap[duty.category] || 'badge-etc');
        document.getElementById('viewTitle').innerText = duty.title;
        document.getElementById('viewAssignee').innerText = duty.assignee ? duty.assignee : '담당자 미지정';
        document.getElementById('viewDay').innerText = duty.day;
        document.getElementById('viewTime').innerText = duty.time || '시간 미지정';
        document.getElementById('viewDescription').innerText = duty.description || '세부 설명이 없습니다.';

        const linkBtn = document.getElementById('viewNotionLink');
        if (duty.notion_link) {
            linkBtn.style.display = 'inline-flex';
            linkBtn.href = duty.notion_link;
        } else {
            linkBtn.style.display = 'none';
        }

        const editBtn = document.getElementById('switchToEditBtn');
        const deleteBtn = document.getElementById('deleteDutyBtnInside');
        editBtn.onclick = () => this.showModal('dutyModal', 'edit', duty.id);
        deleteBtn.onclick = () => this.deleteDuty(duty.id);
    }

    fillEditModal(duty) {
        document.getElementById('editModalTitle').innerText = duty ? 'Edit Task' : 'New Task';
        document.getElementById('dutyCategory').value = duty ? duty.category : 'Director';
        document.getElementById('dutyDay').value = duty ? duty.day : '주일';
        document.getElementById('dutyTime').value = duty ? duty.time : '';
        document.getElementById('dutyTitle').value = duty ? duty.title : '';
        document.getElementById('dutyDescription').value = duty ? duty.description : '';
        document.getElementById('dutyNotionLink').value = duty ? duty.notion_link : '';
        document.getElementById('dutyAssignee').value = duty ? duty.assignee : '';

        lucide.createIcons();
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        if (modalId === 'dutyModal') this.editingDutyId = null;
    }

    handleOutsideClick(e) {
        if (e.target.classList.contains('modal')) {
            this.hideModal(e.target.id);
        }
    }

    renderTrash() {
        const list = document.getElementById('trashList');
        list.innerHTML = '';

        if (this.trash.length === 0) {
            list.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--notion-meta-text);">휴지통이 비었습니다.</div>';
            return;
        }

        this.trash.forEach(item => {
            const row = document.createElement('div');
            row.className = 'trash-item';
            row.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: 500;">${item.title}</div>
                    <div style="font-size: 12px; color: var(--notion-meta-text); margin-top: 4px;">
                        ${item.day} | ${item.category}
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button onclick="tlDashboard.restoreDuty('${item.id}')" class="notion-btn" style="padding: 6px 10px; font-size: 12px;">복구</button>
                    <button onclick="tlDashboard.permanentlyDelete('${item.id}')" class="notion-btn" style="padding: 6px 10px; font-size: 12px; color: var(--notion-red);">삭제</button>
                </div>
            `;
            list.appendChild(row);
        });
    }

    async clearTrash() {
        if (!confirm('휴지통을 완전히 비우시겠습니까?')) return;

        try {
            const { error } = await _supabase
                .from('trash')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // 전체 삭제 트릭
            if (error) throw error;
            await this.loadInitialData(); // 즉시 갱신
        } catch (err) {
            alert('휴지통 비우기 실패: ' + err.message);
        }
    }
}

// 초기화
const tlDashboard = new TeamLeaderDashboard();
