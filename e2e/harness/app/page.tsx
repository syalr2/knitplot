import { ChartMaker } from "../../../components/chart-maker";
import { defaultAccountAvatar } from "../../../lib/account-preferences";

// Separate localhost-only test application, never a route of the shipped app.
export default function SavingHarness() {
  return (
    <ChartMaker
      viewer={{
        id: "browser-test-user",
        email: "test@example.invalid",
        avatar: defaultAccountAvatar(null),
        pinnedChartIds: [],
      }}
      accountsEnabled
      aiConnected={false}
    />
  );
}
