// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const m = vi.hoisted(() => ({
  run: vi.fn(),
  toast: vi.fn(),
  amis: { images: [] as any[] } as any,
  keyPairs: { keyPairs: [{ name: "k1" }] } as any,
  subnets: { subnets: [{ id: "subnet-1", cidrBlock: "10.0.1.0/24" }] } as any,
  sgs: { securityGroups: [{ id: "sg-1", name: "web" }] } as any,
}));

vi.mock("../../hooks/useEC2", () => ({
  useEC2RunInstance: () => ({ mutate: m.run, isPending: false }),
  useEC2Amis: () => ({ data: m.amis }),
  useEC2KeyPairs: () => ({ data: m.keyPairs }),
  useEC2Subnets: () => ({ data: m.subnets }),
  useEC2SecurityGroups: () => ({ data: m.sgs }),
}));
vi.mock("../../components/Toast", () => ({ useToast: () => ({ showToast: m.toast }) }));
// A native <select> stands in for Cloudscape's Select, whose dropdown is hard to drive in happy-dom.
vi.mock("@cloudscape-design/components", async (orig) => ({
  ...(await orig<object>()),
  Select: ({ selectedOption, options, onChange, ariaLabel }: any) => (
    <select
      aria-label={ariaLabel}
      data-selected={selectedOption.label}
      value={selectedOption.value}
      onChange={(e) => onChange({ detail: { selectedOption: options.find((o: any) => o.value === e.target.value) } })}
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}));

import LaunchInstanceView from "./LaunchInstanceView";

beforeEach(() => {
  vi.clearAllMocks();
  m.amis = { images: [] };
});

const field = (label: string) => screen.getByLabelText(label, { selector: "input, select" }) as HTMLInputElement;
const change = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const launch = () => fireEvent.click(screen.getByRole("button", { name: "Launch instance" }));

describe("LaunchInstanceView", () => {
  it("launches with the defaults when no AMIs are registered", () => {
    render(<LaunchInstanceView onDone={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Launch an instance" })).toBeTruthy();
    expect(field("Amazon Machine Image (AMI)").value).toBe("ami-0abcdef1234567891");
    launch();
    expect(m.run).toHaveBeenCalledWith(
      { imageId: "ami-0abcdef1234567891", instanceType: "t3.micro", minCount: 1, maxCount: 1 },
      expect.anything(),
    );
  });

  it("sends the name tag, count, key pair, subnet and security group", () => {
    render(<LaunchInstanceView onDone={vi.fn()} />);
    change("Name", " web ");
    change("Amazon Machine Image (AMI)", " ami-custom ");
    change("Instance type", "m5.large");
    change("Key pair name", "k1");
    change("Subnet", "subnet-1");
    change("Security group", "sg-1");
    change("Number of instances", "3");
    expect(screen.getAllByText("sg-1").length).toBeGreaterThan(0);
    launch();
    expect(m.run).toHaveBeenCalledWith(
      {
        imageId: "ami-custom",
        instanceType: "m5.large",
        minCount: 3,
        maxCount: 3,
        keyName: "k1",
        subnetId: "subnet-1",
        securityGroupIds: ["sg-1"],
        tagSpecifications: [{ resourceType: "instance", tags: [{ key: "Name", value: "web" }] }],
      },
      expect.anything(),
    );
  });

  it("defaults to the first registered AMI and lets the user pick another", () => {
    m.amis = { images: [{ id: "ami-a", name: "Amazon Linux", platform: "Linux" }, { id: "ami-b", architecture: "arm64" }, { id: "ami-c" }] };
    render(<LaunchInstanceView onDone={vi.fn()} />);
    expect(field("Amazon Machine Image (AMI)").getAttribute("data-selected")).toBe("ami-a — Amazon Linux");
    change("Amazon Machine Image (AMI)", "ami-b");
    expect(field("Amazon Machine Image (AMI)").getAttribute("data-selected")).toBe("ami-b");
    launch();
    expect(m.run.mock.calls[0][0].imageId).toBe("ami-b");
  });

  it("validates the AMI and the number of instances", () => {
    render(<LaunchInstanceView onDone={vi.fn()} />);
    const button = () => screen.getByRole("button", { name: "Launch instance" }) as HTMLButtonElement;
    const disabled = () => button().disabled || button().getAttribute("aria-disabled") === "true";
    change("Number of instances", "0");
    expect(screen.getByText("Enter a whole number from 1 to 20.")).toBeTruthy();
    expect(disabled()).toBe(true);
    change("Number of instances", "2");
    change("Amazon Machine Image (AMI)", " ");
    expect(screen.getByText("–")).toBeTruthy();
    expect(disabled()).toBe(true);
  });

  it("reports launch errors and stays on the form", () => {
    const onDone = vi.fn();
    render(<LaunchInstanceView onDone={onDone} />);
    launch();
    const opts = m.run.mock.calls[0][1];
    opts.onError(new Error("Quota"));
    expect(m.toast).toHaveBeenCalledWith("error", "Quota");
    opts.onError({});
    expect(m.toast).toHaveBeenCalledWith("error", "Failed to launch instance");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("shows the Success page with the launched instance IDs", () => {
    const onDone = vi.fn();
    render(<LaunchInstanceView onDone={onDone} />);
    launch();
    act(() => m.run.mock.calls[0][1].onSuccess({ instances: [{ id: "i-1" }, { id: "i-2" }] }));
    expect(screen.getByText("Successfully initiated launch of instances (i-1, i-2)")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Next Steps" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View all instances" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("shows the Success page without IDs when the response has none", () => {
    render(<LaunchInstanceView onDone={vi.fn()} />);
    launch();
    act(() => m.run.mock.calls[0][1].onSuccess(undefined));
    expect(screen.getByText("Successfully initiated launch of instance")).toBeTruthy();
  });

  it("names a single launched instance", () => {
    render(<LaunchInstanceView onDone={vi.fn()} />);
    launch();
    act(() => m.run.mock.calls[0][1].onSuccess({ instances: [{ id: "i-9" }] }));
    expect(screen.getByText("Successfully initiated launch of instance (i-9)")).toBeTruthy();
  });

  it("cancels and copes with missing lookup data", () => {
    m.keyPairs = undefined;
    m.subnets = undefined;
    m.sgs = undefined;
    m.amis = undefined;
    const onDone = vi.fn();
    render(<LaunchInstanceView onDone={onDone} />);
    expect(screen.getByText("Proceed without a key pair")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDone).toHaveBeenCalled();
  });
});
