import type { User } from '../types';

export type EmployeePagePermission = 'view' | 'documents' | 'salaries' | 'salary_details' | 'archives';

export function canAccessEmployeePage(user: User | null, permission: EmployeePagePermission): boolean {
  return Boolean(user?.role === 'PDG' || (user?.role && user.employee_page_permissions?.[permission]));
}

export function canReadEmployeeData(user: User | null, permission: EmployeePagePermission, id: number): boolean {
  return canAccessEmployeePage(user, permission) || Boolean(user?.role && id > 0 && Number(user.id) === id);
}
