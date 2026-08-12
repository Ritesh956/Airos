import { ModulePlaceholder } from '@/ui/ModulePlaceholder';
import { PresentIcon } from '@/ui/icons';

export default function PresentModule() {
  return (
    <ModulePlaceholder
      label="Presentation Mode"
      phase={8}
      icon={<PresentIcon className="h-6 w-6" />}
      description="Drive a slide deck with swipes — no clicker, no keyboard, no assistant hovering by the laptop."
      willInclude={[
        'Swipe left/right to move between slides',
        'Open palm to reveal controls, thumbs up to start, fist to pause',
        'A presenter HUD: current slide, detected gesture, confidence, timer',
      ]}
    />
  );
}
