import type { DesktopApi } from '../shared/ipc/contracts';
declare global { interface Window { discorda?: DesktopApi; } }
