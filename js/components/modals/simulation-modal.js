// ============================================================
// Simulation Modal — add investment simulations
// ============================================================

import * as store from '../../store.js';
import { esc } from '../../utils/dom-helpers.js';
import { emit } from '../../event-bus.js';
import { open as openModal, close as closeModal } from '../ui/modal.js';

const PRESETS = [
    { label: 'שמרני 4%', value: 4 },
    { label: 'מאוזן 7%', value: 7 },
    { label: 'S&P 500 ~10%', value: 10 },
    { label: 'אגרסיבי 12%', value: 12 },
];

let _historicalData = null;

async function loadHistoricalData() {
    if (_historicalData) return _historicalData;
    try {
        const resp = await fetch('./js/data/historical-monthly.json');
        _historicalData = await resp.json();
    } catch (e) {
        console.error('Failed to load historical data:', e);
        _historicalData = {};
    }
    return _historicalData;
}

export function showSimulationModal(kid) {
    const family = store.get('family') || {};
    const sym = family.currency_symbol || '₪';
    const user = store.get('user');

    const presetsHtml = PRESETS.map(p =>
        `<button type="button" class="sim-preset-btn" data-value="${p.value}">${p.label}</button>`
    ).join('');

    const html = `
        <h2>סימולציית השקעה</h2>
        <div class="form-group">
            <label for="sim-name">שם הסימולציה</label>
            <input type="text" id="sim-name" placeholder="למשל: חיסכון לאוניברסיטה">
        </div>

        <div class="form-group">
            <label>סוג סימולציה</label>
            <div class="sim-type-bar">
                <button type="button" class="sim-type-btn active" data-type="fixed">תשואה קבועה</button>
                <button type="button" class="sim-type-btn" data-type="historical">נתונים היסטוריים</button>
            </div>
        </div>

        <div id="sim-fixed-section">
            <div class="form-group">
                <label>תשואה שנתית</label>
                <div class="sim-preset-bar">${presetsHtml}
                    <button type="button" class="sim-preset-btn" data-value="custom">מותאם אישית</button>
                </div>
                <input type="number" id="sim-custom-rate" step="0.1" min="0" max="50" placeholder="% תשואה" class="sim-custom-rate hidden">
            </div>
        </div>

        <div id="sim-historical-section" class="hidden">
            <div class="form-group">
                <label>מדד</label>
                <div class="sim-preset-bar">
                    <button type="button" class="sim-index-btn active" data-index="sp500">S&P 500</button>
                    <button type="button" class="sim-index-btn" data-index="total_us">שוק אמריקאי מלא</button>
                    <button type="button" class="sim-index-btn" data-index="world">מדד עולמי</button>
                </div>
            </div>
            <div class="form-group">
                <label for="sim-start-date">שנת התחלה</label>
                <input type="number" id="sim-start-date" min="1970" max="2024" value="2000" placeholder="1970-2024">
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="sim-initial">סכום התחלתי (${sym})</label>
                <input type="number" id="sim-initial" step="any" min="0" value="1000">
            </div>
            <div class="form-group">
                <label for="sim-monthly">הפקדה חודשית (${sym})</label>
                <input type="number" id="sim-monthly" step="any" min="0" value="100">
            </div>
        </div>

        <div class="form-row">
            <div class="form-group">
                <label for="sim-years">מספר שנים</label>
                <input type="number" id="sim-years" min="1" max="50" value="10">
            </div>
        </div>

        <div class="modal-actions">
            <button class="btn btn-secondary" id="modal-cancel">ביטול</button>
            <button class="btn btn-primary" id="modal-save">צור סימולציה</button>
        </div>
    `;

    openModal(html);
    const modal = document.getElementById('modal-content');

    // Type toggle
    let simType = 'fixed';
    modal.querySelectorAll('.sim-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            simType = btn.dataset.type;
            modal.querySelectorAll('.sim-type-btn').forEach(b => b.classList.toggle('active', b === btn));
            modal.querySelector('#sim-fixed-section').classList.toggle('hidden', simType !== 'fixed');
            modal.querySelector('#sim-historical-section').classList.toggle('hidden', simType !== 'historical');
        });
    });

    // Preset rate buttons
    let selectedRate = 10;
    modal.querySelectorAll('.sim-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.sim-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (btn.dataset.value === 'custom') {
                modal.querySelector('#sim-custom-rate').classList.remove('hidden');
                modal.querySelector('#sim-custom-rate').focus();
                selectedRate = null;
            } else {
                modal.querySelector('#sim-custom-rate').classList.add('hidden');
                selectedRate = parseFloat(btn.dataset.value);
            }
        });
    });
    // Default select S&P 500 preset
    const defaultPreset = modal.querySelector('.sim-preset-btn[data-value="10"]');
    if (defaultPreset) defaultPreset.classList.add('active');

    // Historical index toggle
    let selectedIndex = 'sp500';
    modal.querySelectorAll('.sim-index-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            modal.querySelectorAll('.sim-index-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedIndex = btn.dataset.index;
        });
    });

    // Cancel
    modal.querySelector('#modal-cancel').addEventListener('click', closeModal);

    // Save
    modal.querySelector('#modal-save').addEventListener('click', async () => {
        const name = modal.querySelector('#sim-name').value.trim();
        const initialAmount = parseFloat(modal.querySelector('#sim-initial').value) || 0;
        const monthlyContribution = parseFloat(modal.querySelector('#sim-monthly').value) || 0;
        const years = parseInt(modal.querySelector('#sim-years').value) || 10;

        if (!name) { modal.querySelector('#sim-name').focus(); return; }
        if (initialAmount <= 0 && monthlyContribution <= 0) {
            modal.querySelector('#sim-initial').focus();
            return;
        }

        const record = {
            kid,
            kid_uid: user.uid,
            name,
            initial_amount: initialAmount,
            monthly_contribution: monthlyContribution,
            years: Math.min(years, 50),
            type: simType,
        };

        if (simType === 'fixed') {
            const rate = selectedRate ?? parseFloat(modal.querySelector('#sim-custom-rate').value);
            if (rate == null || isNaN(rate)) { modal.querySelector('#sim-custom-rate').focus(); return; }
            record.annual_return_pct = rate;
        } else {
            record.index_key = selectedIndex;
            record.start_year = parseInt(modal.querySelector('#sim-start-date').value) || 2000;
        }

        try {
            const { add } = await import('../../services/simulation-service.js');
            await add(user.familyId, record);
            closeModal();
            emit('toast', { message: 'סימולציה נוצרה', type: 'success' });
        } catch (e) {
            emit('toast', { message: 'שגיאה ביצירת סימולציה', type: 'error' });
        }
    });

    modal.querySelector('#sim-name').focus();
}

export async function deleteSimulation(id) {
    try {
        const user = store.get('user');
        const { remove } = await import('../../services/simulation-service.js');
        await remove(user.familyId, id);
        emit('toast', { message: 'סימולציה נמחקה', type: 'success' });
    } catch (e) {
        emit('toast', { message: 'שגיאה במחיקת סימולציה', type: 'error' });
    }
}

export { loadHistoricalData };
