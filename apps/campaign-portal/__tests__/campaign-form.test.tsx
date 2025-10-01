import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import userEvent from "@testing-library/user-event";
import CampaignFormPage from "../pages/campaign/new";
import { ChakraProvider } from "@chakra-ui/react";
import { vi } from "vitest";

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    query: {},
    pathname: "/campaign/new"
  })
}));

vi.mock("@chakra-ui/react", async () => {
  const actual = await vi.importActual<any>("@chakra-ui/react");
  return {
    ...actual,
    useToast: () => (() => undefined)
  };
});

vi.mock("@/lib/api", () => ({
  createCampaign: vi.fn().mockResolvedValue({ campaign_id: "cmp_test" }),
  logSubmission: vi.fn().mockResolvedValue(undefined)
}));

async function renderPage() {
  let utils: ReturnType<typeof render> | undefined;
  await act(async () => {
    utils = render(
      <ChakraProvider>
        <CampaignFormPage />
      </ChakraProvider>
    );
  });
  return utils!;
}

async function fillStepOne(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText(/ブランド名/));
  await user.type(screen.getByLabelText(/ブランド名/), "CoinAssist");
  await user.type(screen.getByLabelText(/LP URL/), "https://example.com");
  await user.selectOptions(screen.getByLabelText(/テンプレート指定/), "AUTO");
  await user.click(screen.getByRole("button", { name: "次へ進む" }));
  await waitFor(() => expect(screen.getByText(/Step 2 \/ 5/)).toBeInTheDocument());
}

async function fillStepTwo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/ターゲットメモ/), "テストターゲット");
  const painPointsInput = screen.getAllByLabelText(/課題/)[0];
  await user.type(painPointsInput, "課題A{enter}");
  const valuePropsInputs = screen.getAllByLabelText(/価値提案/);
  await user.type(valuePropsInputs[0], "メリットA{enter}");
  await user.type(screen.getByLabelText(/CTAテキスト/), "無料相談");
  await user.click(screen.getByRole("button", { name: "次へ進む" }));
  await waitFor(() => expect(screen.getByText(/Step 3 \/ 5/)).toBeInTheDocument());
}

async function fillStepThree(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/ロゴ画像URL/), "https://example.com/logo.png");
  await user.click(screen.getByRole("button", { name: "次へ進む" }));
  await waitFor(() => expect(screen.getByText(/Step 4 \/ 5/)).toBeInTheDocument());
}

describe("CampaignFormPage", () => {
  it("blocks progression when required fields are empty", async () => {
    await renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "次へ進む" }));
    const errors = await screen.findAllByText("必須項目です");
    expect(errors.length).toBeGreaterThan(0);
  });

  it("requires stat evidence when stat claim is provided", async () => {
    await renderPage();
    const user = userEvent.setup();
    await fillStepOne(user);
    await fillStepTwo(user);
    await fillStepThree(user);

    await user.type(screen.getByLabelText(/実績・数値訴求/), "95%");
    await user.click(screen.getByRole("button", { name: "次へ進む" }));

    await waitFor(() => {
      expect(screen.getAllByText(/必須項目です/).length).toBeGreaterThanOrEqual(1);
    });
  });
});
