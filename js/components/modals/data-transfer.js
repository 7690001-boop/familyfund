// ============================================================
// Data Transfer — JSON export and import
// ============================================================

import * as store from '../../store.js';
import { emit } from '../../event-bus.js';
import * as investmentService from '../../services/investment-service.js';
import * as goalService from '../../services/goal-service.js';
import t from '../../i18n.js';

export function exportData() {
    const data = {
        family: store.get('family'),
        members: store.get('members'),
        investments: store.get('investments'),
        goals: store.get('goals'),
        exported_at: new Date().toISOString(),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'investments-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    emit('toast', { message: t.dataTransfer.exportedToast, type: 'success' });
}

export function importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            const user = store.get('user');
            if (!user?.familyId) return;

            if (imported.investments) {
                for (const inv of imported.investments) {
                    const { id, ...data } = inv;
                    await investmentService.add(user.familyId, data);
                }
            }

            if (imported.goals) {
                for (const goal of imported.goals) {
                    const { id, ...data } = goal;
                    await goalService.add(user.familyId, data);
                }
            }

            emit('toast', { message: t.dataTransfer.importedToast, type: 'success' });
        } catch (err) {
            emit('toast', { message: t.dataTransfer.fileErrorToast, type: 'error' });
        }
    };
    reader.onerror = () => {
        emit('toast', { message: t.dataTransfer.fileErrorToast, type: 'error' });
    };
    reader.readAsText(file);
}
