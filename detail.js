const firebaseConfig = {
    apiKey: "AIzaSyBxDaIIhmWJOB6w6Jg6Ch6a2-b_5HvJTWw",
    authDomain: "english-fun-1937c.firebaseapp.com",
    databaseURL: "https://english-fun-1937c-default-rtdb.firebaseio.com",
    projectId: "english-fun-1937c",
    storageBucket: "english-fun-1937c.firebasestorage.app",
    messagingSenderId: "236020730818",
    appId: "1:236020730818:web:4ebb378dc7a7005d2fa45b"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentSurveyData = null;

document.addEventListener('DOMContentLoaded', () => {
    requireAuth({ redirectTo: 'login.html' });
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    const btnExport = document.getElementById('btnExportEquipmentExcel');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            exportEquipmentExcel(currentSurveyData);
        });
    }

    if (!id) {
        document.getElementById('detailContent').innerHTML = '<div class="empty-state">Không tìm thấy ID khảo sát.</div>';
        return;
    }

    database.ref('surveys_ATTT').child(id).once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            document.getElementById('detailContent').innerHTML = '<div class="empty-state">Dữ liệu không tồn tại hoặc đã bị xóa.</div>';
            return;
        }
        currentSurveyData = data;
        renderDetail(data);
    });
});

function renderDetail(data) {
    document.getElementById('customerName').innerText = data.don_vi_khao_sat;
    document.getElementById('surveyTime').innerText = `Nhập lúc: ${new Date(data.thoi_gian_nhap).toLocaleString('vi-VN')}`;

    const container = document.getElementById('detailContent');

    let html = `
        <div class="section-header">I. THÔNG TIN CHUNG</div>
        <div class="detail-card">
            <div class="detail-row">
                <div class="detail-label">Đơn vị khảo sát</div>
                <div class="detail-value">${data.don_vi_khao_sat}</div>
            </div>

            <div class="detail-row" style="background: #f0f9ff; border-top: 2px solid #bae6fd; border-bottom: 2px solid #bae6fd; margin: 10px 0;">
                <div class="detail-label" style="font-weight: 800;">TÌNH TRẠNG HỒ SƠ</div>
                <div class="detail-value">
                    <div id="statusUpdateWrapper" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <span id="currentStatusText" class="status-badge" style="background: #e0f2fe; color: #0369a1; padding: 6px 12px; border-radius: 6px; font-weight: 800; border: 1px solid #7dd3fc;">
                            ${(data.quan_ly_ho_so && data.quan_ly_ho_so.tinh_trang) || "Mới khảo sát chưa phân công"}
                        </span>
                        ${renderStatusUpdateUI(data)}
                    </div>
                </div>
            </div>

            <div class="detail-row">
                <div class="detail-label">Ngày khảo sát</div>
                <div class="detail-value">${(data.quan_ly_ho_so && data.quan_ly_ho_so.ngay_khao_sat) || "N/A"}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Người khảo sát</div>
                <div class="detail-value">${(data.quan_ly_ho_so && data.quan_ly_ho_so.nguoi_khao_sat) || "N/A"}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Người viết hồ sơ</div>
                <div class="detail-value">${(data.quan_ly_ho_so && data.quan_ly_ho_so.nguoi_viet_ho_so) || "N/A"}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Hạn viết hồ sơ</div>
                <div class="detail-value">${(data.quan_ly_ho_so && data.quan_ly_ho_so.han_viet_ho_so) || "N/A"}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label" style="display: flex; flex-direction: column; gap: 4px;">
                    <span>Ghi chú viết hồ sơ</span>
                    <p style="font-size: 0.75rem; font-weight: 400; color: #94a3b8; margin: 0;">(Tất cả các quyền đều có thể cập nhật)</p>
                </div>
                <div class="detail-value">
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <textarea id="noteUpdateTextArea" style="width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.9rem; min-height: 80px; background: #fff;">${(data.quan_ly_ho_so && data.quan_ly_ho_so.ghi_chu_viet_ho_so) || ""}</textarea>
                        <button type="button" onclick="updateWritingNotes('${new URLSearchParams(window.location.search).get('id')}')" 
                            style="align-self: flex-end; padding: 6px 16px; font-size: 0.85rem; background: #0f172a; color: white; border-radius: 6px; font-weight: 600;">
                            Lưu ghi chú
                        </button>
                    </div>
                </div>
            </div>

            <div class="detail-row">
                <div class="detail-label">VNPT Khu Vực</div>
                <div class="detail-value">${(data.quan_ly_ho_so && data.quan_ly_ho_so.vnpt_khu_vuc) || "N/A"}</div>
            </div>
        </div>

        <div class="section-header">II. HẠ TẦNG THIẾT BỊ</div>
        <div class="detail-card">
            <div class="detail-row">
                <div class="detail-label">Tổng máy bàn</div>
                <div class="detail-value">${data.ha_tang_thiet_bi.tong_may_ban || 0}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Tổng laptop</div>
                <div class="detail-value">${data.ha_tang_thiet_bi.tong_laptop || 0}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Số máy RAM > 4G</div>
                <div class="detail-value">${data.ha_tang_thiet_bi.so_may_ram_lon_hon_4G || 0}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Số đường internet</div>
                <div class="detail-value">${data.ha_tang_thiet_bi.so_duong_internet || 0}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Số Camera</div>
                <div class="detail-value">${data.ha_tang_thiet_bi.so_camera || "0"}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Cài phần mềm Antivirus</div>
                <div class="detail-value">${data.ha_tang_thiet_bi.cai_phan_mem_antivirus || "Không"}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Số lượng cài SmartIR</div>
                <div class="detail-value">${data.ha_tang_thiet_bi.so_luong_cai_smartIR || 0}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Hệ thống mạng Lan</div>
                <div class="detail-value">
                    <span class="status-badge ${data.ha_tang_thiet_bi.he_thong_mang_lan ? 'status-yes' : 'status-no'}">
                        ${data.ha_tang_thiet_bi.he_thong_mang_lan ? 'CÓ' : 'KHÔNG'}
                    </span>
                </div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Có thi công mạng Lan</div>
                <div class="detail-value">
                    <span class="status-badge ${data.ha_tang_thiet_bi.co_thi_cong_mang_lan ? 'status-yes' : 'status-no'}">
                        ${data.ha_tang_thiet_bi.co_thi_cong_mang_lan ? 'CÓ' : 'KHÔNG'}
                    </span>
                </div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Tường lửa (Firewall)</div>
                <div class="detail-value">
                    <span class="status-badge ${data.ha_tang_thiet_bi.tuong_lua ? 'status-yes' : 'status-no'}">
                        ${data.ha_tang_thiet_bi.tuong_lua ? 'CÓ' : 'KHÔNG'}
                    </span>
                </div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Thiết bị tường lửa</div>
                <div class="detail-value">${data.ha_tang_thiet_bi.thiet_bi_tuong_lua || "N/A"}</div>
            </div>
        </div>

        <div class="section-header">III. CÁC HỆ THỐNG THÔNG TIN KHAI THÁC</div>
        <div class="detail-card">
            <ul style="padding-left: 20px;">
                ${(data.he_thong_thong_tin || []).map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('')}
                ${(data.he_thong_thong_tin || []).length === 0 ? '<li>Chưa chọn hệ thống nào.</li>' : ''}
            </ul>
        </div>

        <div class="section-header">IV. THÔNG TIN LIÊN HỆ</div>
        <div class="detail-card">
            <h4 style="margin-bottom: 12px; color: var(--primary);">1. Đầu mối cung cấp thông tin</h4>
            <div class="detail-row">
                <div class="detail-label">Họ tên</div>
                <div class="detail-value">${data.thong_tin_lien_he.dau_moi_cung_cap.ho_ten || ""}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Số điện thoại</div>
                <div class="detail-value">${data.thong_tin_lien_he.dau_moi_cung_cap.so_dien_thoai || ""}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Đơn vị</div>
                <div class="detail-value">${data.thong_tin_lien_he.dau_moi_cung_cap.don_vi || ""}</div>
            </div>

            <h4 style="margin: 20px 0 12px 0; color: var(--primary);">2. Đơn vị vận hành (UBND xã)</h4>
            <div class="detail-row">
                <div class="detail-label">Người đại diện</div>
                <div class="detail-value">${data.thong_tin_lien_he.don_vi_van_hanh.nguoi_dai_dien || ""}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Chức vụ</div>
                <div class="detail-value">${data.thong_tin_lien_he.don_vi_van_hanh.chuc_vu || ""}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Địa chỉ</div>
                <div class="detail-value">${data.thong_tin_lien_he.don_vi_van_hanh.dia_chi || ""}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Số điện thoại</div>
                <div class="detail-value">${data.thong_tin_lien_he.don_vi_van_hanh.so_dien_thoai || ""}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Thư điện tử</div>
                <div class="detail-value">${data.thong_tin_lien_he.don_vi_van_hanh.thu_dien_tu || ""}</div>
            </div>

            <h4 style="margin: 20px 0 12px 0; color: var(--primary);">3. Công an xã</h4>
            <div class="detail-row">
                <div class="detail-label">Họ tên Trưởng CA</div>
                <div class="detail-value">${data.thong_tin_lien_he.cong_an_xa.ho_ten || ""}</div>
            </div>
            <div class="detail-row">
                <div class="detail-value">${data.thong_tin_lien_he.cong_an_xa.so_dien_thoai || ""}</div>
            </div>
            <div class="detail-row">
                <div class="detail-label">Đơn vị quản lý cấp trên</div>
                <div class="detail-value">${data.thong_tin_lien_he.don_vi_quan_ly_cap_tren || "N/A"}</div>
            </div>
        </div>

        <div class="section-header">V. ĐỀ XUẤT / GHI CHÚ</div>
        <div class="detail-card">
            <div style="white-space: pre-wrap; line-height: 1.6; margin-bottom: 12px;">${data.de_xuat || "Không có ghi chú."}</div>
            ${renderDetailEstimateTable(data.du_toan_thiet_bi)}
        </div>

        <div class="section-header">VI. HÌNH ẢNH HIỆN TRƯỜNG</div>
        <div class="detail-card">
            ${(data.hinh_anh_hien_truong && data.hinh_anh_hien_truong.length > 0) ? `
                <div class="image-grid">
                    ${data.hinh_anh_hien_truong.map(img => {
        let displayUrl = img.url;
        if (displayUrl.includes('drive.google.com')) {
            const fileIdMatch = displayUrl.match(/[-\w]{25,}/);
            if (fileIdMatch) {
                displayUrl = `https://lh3.googleusercontent.com/d/${fileIdMatch[0]}`;
            }
        }
        return `
                            <div class="image-item" style="cursor: pointer;" onclick="openLightbox('${displayUrl}')">
                                <div class="image-preview-wrapper" style="aspect-ratio: 1/1; height: auto;">
                                    <img src="${displayUrl}" alt="Field Photo" style="width:100%; height:100%; object-fit:cover;">
                                </div>
                                <div style="font-size: 0.75rem; color: #475569; margin-top: 4px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${img.caption || '...'}</div>
                            </div>
                        `;
    }).join('')}
                </div>
            ` : '<div class="empty-state">Không có hình ảnh hiện trường được tải lên.</div>'}
        </div>


        ${renderCampusLayoutPreview(data.campusLayout, data.buildingsArray)}
        ${renderBuildingsDetailed(data.buildingsArray)}

        <!-- Lightbox Modal -->
        <div id="imageLightbox" class="image-lightbox" onclick="closeLightbox()">
            <span class="close-lightbox">&times;</span>
            <img id="lightboxImg" src="" alt="Zoomed Image">
        </div>
    `;

    container.innerHTML = html;

    // Vẽ lại dây nối campus sau khi DOM render xong
    setTimeout(() => {
        initCampusLayoutPreviewLines(data.campusLayout);
    }, 0);
}

function renderCampusLayoutPreview(campusLayout, buildingsArray) {
    const layout = campusLayout && typeof campusLayout === 'object' ? campusLayout : null;
    const buildings = Array.isArray(buildingsArray) ? buildingsArray : [];
    if (!layout) {
        return '';
    }

    const safeStr = (v) => (v === null || v === undefined) ? '' : String(v);

    const gatePos = layout.gate || { x: 12, y: 520 - 12 - 64 };
    const network = layout.network || { nodes: [], links: [] };
    const nodes = Array.isArray(network.nodes) ? network.nodes : [];

    // Render buildings blocks with notes + ISP info + floors
    const buildingBlocks = buildings.map((b, idx) => {
        const id = b.id || `bldg_${idx}`;
        const pos = (layout.buildings && layout.buildings[id]) ? layout.buildings[id] : { x: 12 + idx * 24, y: 12 + idx * 18 };

        const eqs = Array.isArray(b.equipments) ? b.equipments : [];
        const ispLines = eqs.map(e => (e && e.isp ? String(e.isp).trim() : '')).filter(v => v !== '');
        const ispCount = ispLines.length;
        const providerMap = new Map();
        ispLines.forEach(v => {
            const key = v.toLowerCase();
            if (!providerMap.has(key)) providerMap.set(key, v);
        });
        const ispProviders = Array.from(providerMap.values());
        const ispText = ispCount > 0 ? `🌐 ISP: ${ispCount} (${ispProviders.join(', ')})` : `🌐 ISP: 0`;

        const ns = Array.isArray(b.nodes) ? b.nodes : [];
        const floorCount = new Set(ns.map(n => n && n.floor !== undefined ? Number(n.floor) : null).filter(v => v !== null && !Number.isNaN(v))).size;

        const note = b.mainNetworkNotes ? String(b.mainNetworkNotes).trim() : '';
        const noteText = note ? note : 'Không có ghi chú tòa nhà';

        const tooltip = `${safeStr(b.name || 'Tòa nhà')}\n🏬 ${floorCount} tầng\n${ispText}${note ? `\n📝 ${note}` : ''}`.trim();

        return `
            <div class="building-block"
                 data-type="building"
                 data-id="${id}"
                 style="left:${pos.x || 12}px; top:${pos.y || 12}px;"
                 title="${tooltip}">
                <div class="building-name">🏢 ${safeStr(b.name) || 'Tòa nhà'}</div>
                <div class="building-sub">🏬 ${floorCount} tầng • ${ns.length} khu vực • ${eqs.length} thiết bị</div>
                <div class="building-sub" style="margin-top:6px;">${ispText}</div>
                <div class="building-note">📝 ${safeStr(noteText)}</div>
            </div>
        `;
    }).join('');

    const netBlocks = nodes.map(n => {
        if (!n || !n.id) return '';
        const kind = (n.kind === 'lb') ? 'lb' : 'isp';
        // fallback title
        const title = n.title ? String(n.title) : (kind === 'lb' ? '⚖️ CBT' : '🌐 Internet');
        const x = (n.x !== undefined) ? n.x : 12;
        const y = (n.y !== undefined) ? n.y : 12;
        return `
            <div class="net-node ${kind}" data-type="net" data-id="${n.id}" style="left:${x}px; top:${y}px;">
                <div class="net-title">${safeStr(title)}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="section-header">VII. SƠ ĐỒ BỐ TRÍ TÒA NHÀ</div>
        <div class="detail-card">
            <div class="campus-preview-wrap">
                <div id="campusPreview" class="campus-preview">
                    <svg id="campusLinkLayer" class="link-layer"></svg>
                    <div class="gate" data-type="gate" data-id="gate" style="left:${gatePos.x || 12}px; top:${gatePos.y || 12}px;">🚪 CỔNG VÀO</div>
                    ${netBlocks}
                    ${buildingBlocks}
                </div>
            </div>
        </div>
    `;
}

function initCampusLayoutPreviewLines(campusLayout) {
    const layout = campusLayout && typeof campusLayout === 'object' ? campusLayout : null;
    const wrap = document.getElementById('campusPreview');
    const svg = document.getElementById('campusLinkLayer');
    if (!layout || !wrap || !svg) return;

    const network = layout.network || { nodes: [], links: [] };
    const links = Array.isArray(network.links) ? network.links : [];

    const getCenter = (el) => {
        const r = el.getBoundingClientRect();
        const cr = wrap.getBoundingClientRect();
        return { x: (r.left - cr.left) + r.width / 2, y: (r.top - cr.top) + r.height / 2 };
    };

    const resolveEl = (it) => {
        if (!it) return null;
        // migrate legacy {from:'id'}
        if (typeof it === 'string') return wrap.querySelector(`.net-node[data-id="${it}"]`);
        if (it.type === 'net') return wrap.querySelector(`.net-node[data-id="${it.id}"]`);
        if (it.type === 'building') return wrap.querySelector(`.building-block[data-id="${it.id}"]`);
        if (it.type === 'gate') return wrap.querySelector(`.gate[data-id="gate"]`);
        return null;
    };

    svg.innerHTML = '';
    const rect = wrap.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);

    links.forEach(l => {
        if (!l) return;
        const a = resolveEl(l.from);
        const b = resolveEl(l.to);
        if (!a || !b) return;
        const ca = getCenter(a);
        const cb = getCenter(b);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(ca.x));
        line.setAttribute('y1', String(ca.y));
        line.setAttribute('x2', String(cb.x));
        line.setAttribute('y2', String(cb.y));
        line.setAttribute('stroke', 'rgba(15, 23, 42, 0.55)');
        line.setAttribute('stroke-width', '3');
        line.setAttribute('stroke-linecap', 'round');
        svg.appendChild(line);
    });
}

function renderBuildingsDetailed(buildingsArray) {
    if (!buildingsArray || !Array.isArray(buildingsArray) || buildingsArray.length === 0) {
        return '';
    }

    const isMainDevice = (eq) => eq && (eq.isMainDevice === true || eq.isMainDevice === "true");
    const safeStr = (v) => (v === null || v === undefined) ? '' : String(v);

    let buildingsHtml = '<div class="section-header">VIII. SƠ ĐỒ TÒA NHÀ & CHI TIẾT THIẾT BỊ</div>';

    buildingsArray.forEach((bldg, index) => {
        buildingsHtml += `
            <div class="detail-card" style="border-left: 5px solid var(--primary);">
                <h3 style="color: var(--primary); margin-bottom: 16px;">${index + 1}. Tòa nhà: ${bldg.name}</h3>
                
                <div style="margin-bottom: 20px;">
                    <h4 style="font-size: 0.95rem; color: var(--text-muted); margin-bottom: 10px;">Cấu trúc & Ghi chú mạng chính:</h4>
                    
                    <!-- Building Photos (MỚI) -->
                    ${(bldg.photos && bldg.photos.length > 0) ? `
                        <div style="margin-bottom: 16px;">
                            <div class="image-grid-compact" style="margin-bottom: 12px;">
                                ${bldg.photos.map(p => {
            let dUrl = p.url;
            if (dUrl.includes('drive.google.com')) {
                const idMatch = dUrl.match(/[-\w]{25,}/);
                if (idMatch) dUrl = `https://lh3.googleusercontent.com/d/${idMatch[0]}`;
            }
            return `
                                        <div class="image-item" style="cursor: pointer;" onclick="openLightbox('${dUrl}')">
                                            <div class="image-preview-wrapper" style="aspect-ratio: 1/1; height: 50px;">
                                                <img src="${dUrl}" alt="Building" style="width:100%; height:100%; object-fit:cover;">
                                            </div>
                                            <div style="font-size: 0.65rem; color: #64748b; margin-top: 4px; border-top: 1px solid #f1f5f9; padding-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.caption || '...'}</div>
                                        </div>
                                    `;
        }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px dashed #cbd5e1; white-space: pre-wrap; margin-bottom: 10px;">${bldg.mainNetworkNotes || 'Không có ghi chú mạng chính.'}</div>
                </div>

                <h4 style="font-size: 1rem; color: var(--text-main); margin: 6px 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Sơ đồ tòa nhà (theo tầng):</h4>
        `;

        // Tạo map để lấy tên khu vực (node)
        const nodeMap = {};
        if (bldg.nodes && Array.isArray(bldg.nodes)) {
            bldg.nodes.forEach(n => nodeMap[n.id] = n.name);
        }

        // ===== Render sơ đồ theo đúng "thẻ" như building.html =====
        const nodes = Array.isArray(bldg.nodes) ? bldg.nodes : [];
        const eqs = Array.isArray(bldg.equipments) ? bldg.equipments : [];

        // Gom nhóm node theo tầng
        const floorsMap = {};
        nodes.forEach(node => {
            const floor = Number(node.floor || 0);
            if (!floorsMap[floor]) floorsMap[floor] = [];
            floorsMap[floor].push(node);
        });

        const floorNums = Object.keys(floorsMap)
            .map(k => Number(k))
            .filter(n => !Number.isNaN(n))
            .sort((a, b) => b - a); // giống building.js

        if (floorNums.length > 0) {
            buildingsHtml += `<div class="bldg-map"><div class="floors-container">`;

            floorNums.forEach(floorNum => {
                const nodesInFloor = floorsMap[floorNum] || [];
                const leftNodes = nodesInFloor.filter(n => n.position === 'left');
                const centerNodes = nodesInFloor.filter(n => n.position === 'center');
                const rightNodes = nodesInFloor.filter(n => n.position === 'right');
                const displayNodes = [...leftNodes, ...centerNodes, ...rightNodes];

                buildingsHtml += `
                    <div class="floor-row">
                        <div class="floor-title">TẦNG ${floorNum}</div>
                        <div class="floor-horizontal-scroll">
                `;

                displayNodes.forEach(node => {
                    const nodeEqs = eqs.filter(eq => eq.nodeId === node.id);
                    const eqCount = nodeEqs.length;
                    const hasIsp = nodeEqs.some(eq => eq.isp && String(eq.isp).trim() !== '');
                    const hasMainDev = nodeEqs.some(eq => isMainDevice(eq));

                    let extraClass = '';
                    if (node.type === 'Corridor') extraClass = 'corridor-node';
                    if (node.type === 'Staircase') extraClass = 'staircase-node';
                    if (hasIsp) extraClass += (extraClass ? ' ' : '') + 'has-isp-room';

                    let icon = '';
                    if (node.type === 'Corridor') icon = '🚪 ';
                    if (node.type === 'Staircase') icon = '🪜 ';

                    const customNameStyle = hasMainDev ? `color: #ef4444 !important; font-weight: 800;` : '';
                    const status = (node.status === 0 || node.status === 1 || node.status === 2) ? node.status : 0;
                    const noteText = (node.notes && String(node.notes).trim() !== '') ? `\n📝 ${String(node.notes).trim()}` : '';
                    const rightText = (node.rightRooms && String(node.rightRooms).trim() !== '') ? `\n🏢 DS Phòng: ${String(node.rightRooms).replace(/\n/g, ', ')}` : '';
                    const tooltip = `${safeStr(node.name)}${noteText}${rightText}`.trim();

                    let noteHtml = '';
                    const noteContent = (node.notes && String(node.notes).trim() !== '') ? `<div style="margin-bottom: 2px;">📝 ${String(node.notes).trim().replace(/\n/g, '<br>')}</div>` : '';
                    const rightRoomsContent = (node.rightRooms && String(node.rightRooms).trim() !== '') ? `<div>🏢 ${String(node.rightRooms).trim().replace(/\n/g, '<br>')}</div>` : '';

                    if (noteContent || rightRoomsContent) {
                        noteHtml = `<div style="font-size: 0.75rem; color: #64748b; margin-top: 8px; padding: 4px; background: rgba(0,0,0,0.02); border-radius: 4px; line-height: 1.3; word-break: break-word; text-align: left; width: 100%;">
                            ${noteContent}
                            ${rightRoomsContent}
                        </div>`;
                    }

                    // Tạo danh sách thiết bị thu nhỏ
                    let eqListHtml = '';
                    if (nodeEqs.length > 0) {
                        eqListHtml = `<div class="room-eq-list">`;
                        nodeEqs.forEach(eq => {
                            const isMain = isMainDevice(eq);
                            const nameModel = `${safeStr(eq.name)}${eq.model ? ` (${safeStr(eq.model)})` : ''}`;
                            eqListHtml += `<div class="room-eq-item ${isMain ? 'main' : ''}" title="${nameModel}">${isMain ? '🌟 ' : ''}${nameModel}</div>`;
                        });
                        eqListHtml += `</div>`;
                    }

                    buildingsHtml += `
                        <div class="room-card ${extraClass} status-${status}" title="${tooltip}" onclick="showRoomEquipments(${index}, '${node.id}')">
                            <div class="room-name" style="${customNameStyle}" title="${tooltip}">${icon}${safeStr(node.name)}</div>
                            <div class="room-eq-count" style="margin-bottom: 4px;" onclick="event.stopPropagation(); showRoomEquipments(${index}, '${node.id}')">💻 ${eqCount}</div>
                            ${noteHtml}
                            ${eqListHtml}
                        </div>
                    `;
                });

                buildingsHtml += `
                        </div>
                    </div>
                `;
            });

            buildingsHtml += `</div></div>`;
        } else {
            buildingsHtml += `<div class="empty-state" style="padding: 10px; margin-bottom: 10px;">Tòa nhà này chưa có sơ đồ khu vực (phòng/tầng).</div>`;
        }

        buildingsHtml += `
                <h4 style="font-size: 1rem; color: var(--text-main); margin: 18px 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Danh sách thiết bị chi tiết:</h4>
        `;

        // Tạo danh sách phẳng tất cả thiết bị
        let allEqs = [];
        if (bldg.equipments && Array.isArray(bldg.equipments)) {
            allEqs = [...bldg.equipments];
        }

        // Sắp xếp thiết bị:
        // 1. Ưu tiên thiết bị mạng chính (true trước)
        // 2. Tên thiết bị (A-Z)
        // 3. Model (A-Z)
        allEqs.sort((a, b) => {
            const aMain = isMainDevice(a) ? 1 : 0;
            const bMain = isMainDevice(b) ? 1 : 0;
            if (aMain !== bMain) return bMain - aMain; // 1 trước 0

            const aName = (a.name || '').toLowerCase();
            const bName = (b.name || '').toLowerCase();
            if (aName !== bName) return aName.localeCompare(bName);

            const aModel = (a.model || '').toLowerCase();
            const bModel = (b.model || '').toLowerCase();
            return aModel.localeCompare(bModel);
        });

        if (allEqs.length > 0) {
            buildingsHtml += `
                <table class="building-table">
                    <thead>
                        <tr>
                            <th style="width: 6%;">STT</th>
                            <th style="width: 34%;">Tên thiết bị, Model</th>
                            <th style="width: 20%;">Vị trí</th>
                            <th style="width: 40%;">Mục đích và Khu vực</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            allEqs.forEach((eq, idx) => {
                const nodeName = nodeMap[eq.nodeId] || 'Không xác định';
                const mainLabel = isMainDevice(eq) ? `<span class="tag tag-main">🌟 Mạch chính</span>` : '';
                const networkZone = (eq.isp && String(eq.isp).trim() !== '') ? 'Vùng mạng biên' : 'Vùng mạng nội bộ';
                const nameModel = `${safeStr(eq.name)}${eq.model ? ` (${safeStr(eq.model)})` : ''}`;

                buildingsHtml += `
                            <tr>
                                <td style="text-align: center; font-weight: 700; color: #475569;">${idx + 1}</td>
                                <td>
                                    <div style="font-weight: 700; color: #0f172a;">${nameModel || '-'}</div>
                                    ${mainLabel}
                                </td>
                                <td style="font-weight: 700; color: #334155;">${networkZone}</td>
                                <td>
                                    <div style="font-weight: 600; color: #334155;">🎯 ${safeStr(eq.purpose) || '-'}</div>
                                    <div style="margin-top: 4px; font-size: 0.9rem; color: var(--text-muted);">📍 ${nodeName}</div>
                                </td>
                            </tr>
                `;
            });

            buildingsHtml += `
                        </tbody>
                    </table>
            `;
        } else {
            buildingsHtml += `<div class="empty-state" style="padding: 10px;">Tòa nhà này chưa có thông tin thiết bị chi tiết.</div>`;
        }

        buildingsHtml += `</div>`; // Đóng detail-card của building
    });

    return buildingsHtml;
}

// Global functions for lightbox
window.openLightbox = function (url) {
    const lightbox = document.getElementById('imageLightbox');
    const img = document.getElementById('lightboxImg');
    if (lightbox && img) {
        img.src = url;
        lightbox.classList.add('active');
        lightbox.classList.remove('zoomed'); // reset zoom
        document.body.style.overflow = 'hidden'; // Ngăn scroll
        
        // Ensure image starts centered and zoomable
        img.onclick = function(e) {
            e.stopPropagation(); // prevent lightbox close
            lightbox.classList.toggle('zoomed');
            if (lightbox.classList.contains('zoomed')) {
                // If it's a very tall image, scroll to top
                lightbox.scrollTop = 0;
            }
        };
    }
};

window.closeLightbox = function () {
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
        lightbox.classList.remove('zoomed');
        document.body.style.overflow = ''; // Cho phép scroll lại
    }
};

// Close modal if clicking background (not image)
window.addEventListener('DOMContentLoaded', () => {
    const lightbox = document.getElementById('imageLightbox');
    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });
    }
});

function exportEquipmentExcel(surveyData) {
    if (!surveyData || !surveyData.buildingsArray || !Array.isArray(surveyData.buildingsArray)) {
        alert("Chưa có dữ liệu tòa nhà/thiết bị để xuất.");
        return;
    }
    if (typeof XLSX === 'undefined') {
        alert("Thiếu thư viện xuất Excel (XLSX). Vui lòng kiểm tra kết nối mạng hoặc tải lại trang.");
        return;
    }

    const isMainDevice = (eq) => eq && (eq.isMainDevice === true || eq.isMainDevice === "true");
    const safeStr = (v) => (v === null || v === undefined) ? '' : String(v);

    // Flatten toàn bộ thiết bị (thêm cột Tòa nhà & Khu vực)
    const flat = [];
    (surveyData.buildingsArray || []).forEach(bldg => {
        const nodeMap = {};
        if (bldg.nodes && Array.isArray(bldg.nodes)) {
            bldg.nodes.forEach(n => nodeMap[n.id] = n.name);
        }
        const eqs = (bldg.equipments && Array.isArray(bldg.equipments)) ? bldg.equipments : [];
        eqs.forEach(eq => {
            flat.push({
                building: safeStr(bldg.name),
                name: safeStr(eq.name),
                model: safeStr(eq.model),
                isMain: isMainDevice(eq),
                isp: safeStr(eq.isp),
                purpose: safeStr(eq.purpose),
                area: safeStr(nodeMap[eq.nodeId] || 'Không xác định')
            });
        });
    });

    if (flat.length === 0) {
        alert("Không có thiết bị để xuất.");
        return;
    }

    // Sort: mạng chính -> tên -> model (phụ: tòa nhà -> khu vực)
    flat.sort((a, b) => {
        const aMain = a.isMain ? 1 : 0;
        const bMain = b.isMain ? 1 : 0;
        if (aMain !== bMain) return bMain - aMain;
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (aName !== bName) return aName.localeCompare(bName);
        const aModel = a.model.toLowerCase();
        const bModel = b.model.toLowerCase();
        if (aModel !== bModel) return aModel.localeCompare(bModel);
        const aB = a.building.toLowerCase();
        const bB = b.building.toLowerCase();
        if (aB !== bB) return aB.localeCompare(bB);
        return a.area.toLowerCase().localeCompare(b.area.toLowerCase());
    });

    // Xuất đúng “4 cột” như bảng + thêm Tòa nhà để tránh lẫn
    const header = ["STT", "Tòa nhà", "Tên thiết bị, Model", "Vị trí", "Mục đích và Khu vực"];
    const rows = flat.map((r, idx) => {
        const nameModel = `${r.name}${r.model ? ` (${r.model})` : ''}`.trim();
        const networkZone = r.isp && r.isp.trim() !== '' ? 'Vùng mạng biên' : 'Vùng mạng nội bộ';
        const purposeArea = `${r.purpose || '-'} | ${r.area || '-'}`;
        return [idx + 1, r.building || '-', nameModel || '-', networkZone, purposeArea];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    // Độ rộng cột tương đối
    ws['!cols'] = [
        { wch: 6 },
        { wch: 20 },
        { wch: 34 },
        { wch: 18 },
        { wch: 40 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DanhSachThietBi");

    const org = safeStr(surveyData.don_vi_khao_sat).replace(/[\\/:*?"<>|]+/g, '').trim();
    const fileName = `danh_sach_thiet_bi_${org || 'khao_sat'}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

function renderStatusUpdateUI(data) {
    const auth = authGet();
    if (!auth) return '';

    const currentStatus = (data.quan_ly_ho_so && data.quan_ly_ho_so.tinh_trang) || "Mới khảo sát chưa phân công";
    const statusOptions = [
        "Mới khảo sát chưa phân công",
        "Đã phân công",
        "Hồ sơ chưa đạt, yêu cầu viết lại",
        "Hồ sơ thiếu thông tin không viết được",
        "Đã gửi cho quản lý địa bàn",
        "Đã gửi lại hồ sơ cho VNPT Khu Vực",
        "Đã gửi cho CA",
        "Công an đã phê duyệt",
        "Công an trả lại"
    ];

    let allowedOptions = [];
    if (auth.role === 'admin' || auth.role === 'editor') {
        allowedOptions = statusOptions;
    } else if (auth.role === 'viewer') {
        const viewerAllowedFrom = [
            "Mới khảo sát chưa phân công",
            "Đã phân công",
            "Hồ sơ chưa đạt, yêu cầu viết lại",
            "Hồ sơ thiếu thông tin không viết được",
            "Đã tiếp xúc chờ khách hàng phản hồi"
        ];

        if (viewerAllowedFrom.includes(currentStatus)) {
            allowedOptions = [
                "Hồ sơ chưa đạt, yêu cầu viết lại",
                "Hồ sơ thiếu thông tin không viết được",
                "Đã gửi cho quản lý địa bàn"
            ];
        } else {
            return ''; // Viewer cannot update if not in allowed statuses
        }
    } else {
        return '';
    }

    if (allowedOptions.length === 0) return '';

    const id = new URLSearchParams(window.location.search).get('id');

    return `
        <select id="selectStatusUpdate" style="padding: 6px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.85rem;">
            <option value="">-- Cập nhật trạng thái --</option>
            ${allowedOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
        </select>
        <button type="button" onclick="updateSurveyStatus('${id}')" 
            style="padding: 6px 12px; font-size: 0.85rem; background: var(--primary); color: white; border-radius: 6px;">
            Cập nhật
        </button>
    `;
}

window.updateSurveyStatus = function (id) {
    const select = document.getElementById('selectStatusUpdate');
    const newStatus = select.value;
    if (!newStatus) {
        alert("Vui lòng chọn trạng thái mới.");
        return;
    }

    if (!confirm(`Xác nhận chuyển trạng thái sang: ${newStatus}?`)) return;

    database.ref('surveys_ATTT').child(id).update({
            "quan_ly_ho_so/tinh_trang": newStatus,
        "nguoi_cap_nhat_trang_thai": authGet().user,
        "thoi_gian_cap_nhat_trang_thai": new Date().toISOString()
    }).then(() => {
        alert("Cập nhật trạng thái thành công!");
        location.reload();
    }).catch(err => {
        alert("Lỗi khi cập nhật trạng thái: " + err.message);
    });
}

function renderDetailEstimateTable(estimateItems) {
    if (!estimateItems || !Array.isArray(estimateItems) || estimateItems.length === 0) return '';
    
    let total = 0;
    let rowsHtml = '';
    estimateItems.forEach((item, idx) => {
        const tt = item.sl * item.don_gia;
        total += tt;
        rowsHtml += `
            <tr>
                <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                <td style="font-weight: 600; color: #0f172a;">${item.ten || '-'}</td>
                <td style="text-align: center;">${item.sl || 0}</td>
                <td style="text-align: right; color: #0369a1;">${(item.don_gia || 0).toLocaleString('vi-VN')}</td>
                <td style="text-align: right; font-weight: 600; color: #334155;">${tt.toLocaleString('vi-VN')}</td>
            </tr>
        `;
    });

    return `
        <div style="margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 16px;">
            <h4 style="margin: 0 0 12px 0; font-size: 1rem; color: #0f172a;">Dự toán thiết bị đề xuất</h4>
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table class="building-table" style="margin-top: 0; min-width: 500px;">
                    <thead>
                        <tr>
                            <th style="width: 50px; text-align: center;">STT</th>
                            <th>Thiết bị / Vật tư</th>
                            <th style="width: 80px; text-align: center;">SL</th>
                            <th style="width: 120px; text-align: right;">Đơn giá</th>
                            <th style="width: 140px; text-align: right;">Thành tiền</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr style="background: #f1f5f9; border-top: 2px solid #cbd5e1;">
                            <td colspan="4" style="text-align: right; font-weight: 700; color: #0f172a; padding: 12px;">Tổng cộng:</td>
                            <td style="text-align: right; font-weight: 800; color: #b91c1c; font-size: 1.05rem; padding: 12px;">${total.toLocaleString('vi-VN')}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

window.updateWritingNotes = function (id) {
    const newNote = document.getElementById('noteUpdateTextArea').value;

    database.ref('surveys_ATTT').child(id).update({
        "quan_ly_ho_so/ghi_chu_viet_ho_so": newNote,
        "nguoi_cap_nhat_ghi_chu": authGet().user,
        "thoi_gian_cap_nhat_ghi_chu": new Date().toISOString()
    }).then(() => {
        alert("Cập nhật ghi chú thành công!");
    }).catch(err => {
        alert("Lỗi khi cập nhật ghi chú: " + err.message);
    });
};

// --- Room Equipment Popup Functions ---

window.showRoomEquipments = function(bldgIndex, nodeId) {
    if (!currentSurveyData || !currentSurveyData.buildingsArray) return;
    
    const bldg = currentSurveyData.buildingsArray[bldgIndex];
    if (!bldg) return;
    
    const nodes = Array.isArray(bldg.nodes) ? bldg.nodes : [];
    const node = nodes.find(n => n.id === nodeId);
    const nodeName = node ? node.name : 'Phòng không xác định';
    
    const eqs = Array.isArray(bldg.equipments) ? bldg.equipments : [];
    const roomEqs = eqs.filter(eq => eq.nodeId === nodeId);
    
    const modal = document.getElementById('roomEqModal');
    const modalTitle = document.getElementById('modalRoomName');
    const modalBody = document.getElementById('modalRoomBody');
    
    if (!modal || !modalTitle || !modalBody) return;
    
    modalTitle.innerText = `Danh sách thiết bị: ${nodeName}`;
    
    if (roomEqs.length === 0) {
        modalBody.innerHTML = '<div class="empty-state">Không có thiết bị nào trong phòng này.</div>';
    } else {
        let html = `
            <table class="building-table">
                <thead>
                    <tr>
                        <th style="width: 8%;">STT</th>
                        <th style="width: 50%;">Tên thiết bị, Model</th>
                        <th style="width: 42%;">Mục đích / Ghi chú</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        const isMainDevice = (eq) => eq && (eq.isMainDevice === true || eq.isMainDevice === "true");
        const safeStr = (v) => (v === null || v === undefined) ? '' : String(v);

        roomEqs.forEach((eq, idx) => {
            const mainLabel = isMainDevice(eq) ? `<br><span class="tag tag-main">🌟 Mạch chính</span>` : '';
            const nameModel = `${safeStr(eq.name)}${eq.model ? ` (${safeStr(eq.model)})` : ''}`;
            
            html += `
                <tr>
                    <td style="text-align: center; font-weight: 700;">${idx + 1}</td>
                    <td>
                        <div style="font-weight: 700; color: #0f172a;">${nameModel || '-'}</div>
                        ${mainLabel}
                    </td>
                    <td>
                        <div style="font-weight: 500; color: #334155;">${safeStr(eq.purpose) || '-'}</div>
                        ${eq.isp ? `<div style="margin-top: 4px; font-size: 0.8rem; color: #0369a1;">🌐 ISP: ${eq.isp}</div>` : ''}
                    </td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        modalBody.innerHTML = html;
    }
    
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent background scroll
};

window.closeRoomEquipments = function() {
    const modal = document.getElementById('roomEqModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = ''; // Restore scroll
    }
};

// Close modal if clicking outside the content
window.addEventListener('click', (event) => {
    const modal = document.getElementById('roomEqModal');
    if (event.target == modal) {
        closeRoomEquipments();
    }
});
