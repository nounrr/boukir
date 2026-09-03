import { useAuth } from './redux';
import { canViewInternalPrices } from '../utils/internalPrices';

export function useCanViewInternalPrices() {
  const { user } = useAuth();
  return canViewInternalPrices(user?.role);
}
