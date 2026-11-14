import { trustedHtml } from '@livedoc/ui';
import { TelemetryDashboard } from './TelemetryDashboard';
import { SUMMARY_BOOT_SCRIPT } from './summary-request';

// The dashboard (docs/specs/017-telemetry/telemetry.md), its summary asked for before any of its markup
// (docs/specs/016-platform/web-performance.md "Delivery").
export default function TelemetryPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: trustedHtml(SUMMARY_BOOT_SCRIPT) }} />
      <TelemetryDashboard />
    </>
  );
}
