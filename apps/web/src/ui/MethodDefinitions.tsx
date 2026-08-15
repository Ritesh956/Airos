import type { Method } from '@/vision/types';
import { METHOD_DESCRIPTION, methodDescriptionId } from './methodDescriptions';

/**
 * Three fixed, visually-hidden definitions — one per `Method` value, ever —
 * mounted once in `AppShell`. Every `MethodBadge` in the app points its
 * `aria-describedby` at one of these three ids instead of embedding its own
 * copy of the sentence, so a page with eight readouts puts this text in the
 * DOM three times total, not eight (CLAUDE.md UI/UX audit finding #10 —
 * "72 words of repeated boilerplate to hear the eight numbers").
 */
export function MethodDefinitions() {
  return (
    <div className="sr-only">
      {(Object.keys(METHOD_DESCRIPTION) as Method[]).map((method) => (
        <p key={method} id={methodDescriptionId(method)}>
          {METHOD_DESCRIPTION[method]}
        </p>
      ))}
    </div>
  );
}
