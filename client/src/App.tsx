import { WorkbenchLayout } from './components/layout/WorkbenchLayout';
import { SettingsProvider } from './settings';

export default function App() {
  return (
    <SettingsProvider>
      <WorkbenchLayout />
    </SettingsProvider>
  );
}
