import { ModulePlaceholder } from '@/ui/ModulePlaceholder';
import { AnalyticsIcon } from '@/ui/icons';

export default function AnalyticsModule() {
  return (
    <ModulePlaceholder
      label="Analytics"
      phase={13}
      icon={<AnalyticsIcon className="h-6 w-6" />}
      description="A technical performance panel showing exactly what the vision pipeline is costing, measured — never estimated."
      willInclude={[
        'FPS, inference time, and render time, each measured with performance.now()',
        'A live FPS history graph and a hand/face/pose detection summary',
        'A debug mode exposing raw and normalized landmark coordinates and gesture state transitions',
      ]}
    />
  );
}
