// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

const m = vi.hoisted(() => ({
  instances: vi.fn(),
  instance: vi.fn(),
  refetch: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  reboot: vi.fn(),
  terminate: vi.fn(),
  toast: vi.fn(),
  pending: { start: false, stop: false, reboot: false, terminate: false },
}));

vi.mock("../../hooks/useEC2", () => ({
  useEC2Instances: () => m.instances(),
  useEC2Instance: (id: string) => m.instance(id),
  useEC2StartInstance: () => ({ mutate: m.start, isPending: m.pending.start }),
  useEC2StopInstance: () => ({ mutate: m.stop, isPending: m.pending.stop }),
  useEC2RebootInstance: () => ({ mutate: m.reboot, isPending: m.pending.reboot }),
  useEC2TerminateInstance: () => ({ mutateAsync: m.terminate, isPending: m.pending.terminate }),
}));
vi.mock("../../components/Toast", () => ({ useToast: () => ({ showToast: m.toast }) }));
vi.mock("../../components/EC2Terminal", () => ({
  default: ({ instanceId, onClose }: any) => <button onClick={onClose}>terminal {instanceId}</button>,
}));
vi.mock("@cloudscape-design/components", async (orig) => ({
  ...(await orig<object>()),
  ...(await import("../../../test/cloudscapeMocks")).cloudscapeMocks,
}));

import { EC2InstanceDetail, EC2InstanceList, InstanceState, instanceName, CommandBox } from "./InstancesView";

const web = { id: "i-web", state: "running", instanceType: "t3.micro", tags: [{ key: "Name", value: "web" }], publicIp: "1.2.3.4", launchTime: "2026-01-02T03:04:05Z", availabilityZone: "us-east-1a" };
const db = { id: "i-db", state: "stopped", tags: [] };
const gone = { id: "i-gone", state: "terminated", tags: [] };

function list(instances: any[], extra: object = {}) {
  m.instances.mockReturnValue({ data: { instances, total: instances.length }, isLoading: false, isError: false, error: null, refetch: m.refetch, ...extra });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(m.pending, { start: false, stop: false, reboot: false, terminate: false });
  for (const fn of [m.start, m.stop, m.reboot]) fn.mockImplementation((_id: string, opts: any) => opts.onSuccess());
  m.terminate.mockResolvedValue({});
  list([web, db, gone]);
});

const rowCheckbox = (id: string) => within(screen.getByText(id).closest("tr")!).getByRole("checkbox");
const btn = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const isDisabled = (b: HTMLButtonElement) => b.disabled || b.getAttribute("aria-disabled") === "true";

describe("instanceName / InstanceState", () => {
  it("reads the Name tag", () => {
    expect(instanceName(web)).toBe("web");
    expect(instanceName({ tags: [{ key: "Name", value: "" }] })).toBeUndefined();
    expect(instanceName({})).toBeUndefined();
  });

  it("capitalizes the state and handles unknown values", () => {
    const { rerender } = render(<InstanceState state="shutting-down" />);
    expect(screen.getByText("Shutting-down")).toBeTruthy();
    rerender(<InstanceState state="weird" />);
    expect(screen.getByText("Weird")).toBeTruthy();
    rerender(<InstanceState />);
    expect(screen.getByText("Unknown")).toBeTruthy();
  });
});

describe("EC2InstanceList", () => {
  it("lists non-terminated instances with console columns", () => {
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    expect(screen.getByText("(2)")).toBeTruthy();
    expect(screen.queryByText("i-gone")).toBeNull();
    expect(screen.getByText("web")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();
    expect(screen.getByText("1.2.3.4")).toBeTruthy();
    expect(screen.getByText(new Date(web.launchTime).toLocaleString())).toBeTruthy();
    expect(screen.getAllByText("–").length).toBeGreaterThan(5);
  });

  it("opens an instance from its ID link and launches from the header", () => {
    const onSelect = vi.fn();
    const onLaunch = vi.fn();
    render(<EC2InstanceList onSelect={onSelect} onLaunch={onLaunch} onLaunchFromTemplate={vi.fn()} />);
    fireEvent.click(btn("i-web"));
    expect(onSelect).toHaveBeenCalledWith("i-web");
    fireEvent.click(btn("Launch instances"));
    expect(onLaunch).toHaveBeenCalled();
  });

  it("opens details or connects from Actions for a single selection", () => {
    const onSelect = vi.fn();
    render(<EC2InstanceList onSelect={onSelect} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    expect(isDisabled(btn("View instance details"))).toBe(true);
    expect(isDisabled(btn("Connect to instance"))).toBe(true);
    fireEvent.click(rowCheckbox("i-web"));
    fireEvent.click(btn("View instance details"));
    expect(onSelect).toHaveBeenCalledWith("i-web");
    fireEvent.click(btn("Connect to instance"));
    expect(screen.getByRole("dialog", { name: "Terminal — i-web" })).toBeTruthy();
  });

  it("launches from a template through the split button", () => {
    const onLaunchFromTemplate = vi.fn();
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={onLaunchFromTemplate} />);
    fireEvent.click(btn("Launch instance from template"));
    expect(onLaunchFromTemplate).toHaveBeenCalled();
  });

  it("refreshes", () => {
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    fireEvent.click(btn("Refresh instances"));
    expect(m.refetch).toHaveBeenCalled();
  });

  it("filters by name, id or address and shows no matches", () => {
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    const input = screen.getByPlaceholderText("Find Instance by attribute or tag (case-insensitive)");
    fireEvent.change(input, { target: { value: "WEB" } });
    expect(screen.queryByText("i-db")).toBeNull();
    expect(screen.getAllByText("1 match").length).toBeGreaterThan(0);
    fireEvent.change(input, { target: { value: "nothing" } });
    expect(screen.getByText("No matches")).toBeTruthy();
    expect(screen.getAllByText("0 matches").length).toBeGreaterThan(0);
  });

  it("offers Launch instances in the empty state", () => {
    list([]);
    const onLaunch = vi.fn();
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={onLaunch} onLaunchFromTemplate={vi.fn()} />);
    expect(screen.getByText("You do not have any instances in this region")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Launch instances" })[1]);
    expect(onLaunch).toHaveBeenCalled();
  });

  it("handles a missing payload and shows load errors", () => {
    m.instances.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("boom"), refetch: m.refetch });
    const { unmount } = render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    expect(screen.getByText("boom")).toBeTruthy();
    unmount();
    m.instances.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: null, refetch: m.refetch });
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    expect(screen.getByText("Failed to load instances")).toBeTruthy();
  });

  it("enables Connect only for a single running instance and opens the terminal", () => {
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    expect(isDisabled(btn("Connect"))).toBe(true);
    fireEvent.click(rowCheckbox("i-db"));
    expect(isDisabled(btn("Connect"))).toBe(true);
    fireEvent.click(rowCheckbox("i-db"));
    fireEvent.click(rowCheckbox("i-web"));
    fireEvent.click(btn("Connect"));
    expect(screen.getByRole("dialog", { name: "Terminal — i-web" })).toBeTruthy();
    fireEvent.click(btn("terminal i-web"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("enables state actions by the selected instances' state", () => {
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    fireEvent.click(rowCheckbox("i-web"));
    expect(isDisabled(btn("Stop instance"))).toBe(false);
    expect(isDisabled(btn("Start instance"))).toBe(true);
    fireEvent.click(rowCheckbox("i-db"));
    expect(isDisabled(btn("Stop instance"))).toBe(true);
    expect(isDisabled(btn("Reboot instance"))).toBe(true);
    expect(isDisabled(btn("Terminate (delete) instance"))).toBe(false);
  });

  it("stops, reboots and starts the selection with a success message", () => {
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    fireEvent.click(rowCheckbox("i-web"));
    fireEvent.click(btn("Stop instance"));
    expect(m.stop).toHaveBeenCalledWith("i-web", expect.anything());
    expect(m.toast).toHaveBeenCalledWith("success", "Successfully stopped i-web");
    fireEvent.click(btn("Reboot instance"));
    expect(m.toast).toHaveBeenCalledWith("success", "Successfully rebooted i-web");
    fireEvent.click(rowCheckbox("i-web"));
    fireEvent.click(rowCheckbox("i-db"));
    fireEvent.click(btn("Start instance"));
    expect(m.toast).toHaveBeenCalledWith("success", "Successfully started i-db");
  });

  it("terminates the selection after confirming and clears it", async () => {
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    fireEvent.click(rowCheckbox("i-web"));
    fireEvent.click(rowCheckbox("i-db"));
    fireEvent.click(btn("Terminate (delete) instance"));
    const dialog = screen.getByRole("dialog", { name: "Terminate (delete) instance?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminate (delete)" }));
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith("success", "Successfully initiated termination of i-web, i-db"));
    expect(m.terminate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(isDisabled(btn("Connect"))).toBe(true);
  });

  it("reports terminate failures and can cancel", async () => {
    m.terminate.mockRejectedValueOnce(new Error("Protected")).mockRejectedValueOnce({});
    render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    fireEvent.click(rowCheckbox("i-web"));
    fireEvent.click(btn("Terminate (delete) instance"));
    const confirm = () => fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Terminate (delete)" }));
    confirm();
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith("error", "Protected"));
    confirm();
    await waitFor(() => expect(m.toast).toHaveBeenCalledWith("error", "Failed to terminate instance"));
    fireEvent.click(btn("Cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(btn("Terminate (delete) instance"));
    fireEvent.click(btn("Dismiss modal"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops selected instances that disappear on refetch", () => {
    const { rerender } = render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    fireEvent.click(rowCheckbox("i-web"));
    expect(isDisabled(btn("Connect"))).toBe(false);
    list([db]);
    rerender(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
    expect(isDisabled(btn("Connect"))).toBe(true);
  });

  it("shows a busy state menu while an action is pending", () => {
    for (const k of ["start", "stop", "reboot"] as const) {
      Object.assign(m.pending, { start: false, stop: false, reboot: false, [k]: true });
      const { unmount } = render(<EC2InstanceList onSelect={vi.fn()} onLaunch={vi.fn()} onLaunchFromTemplate={vi.fn()} />);
      expect(screen.getAllByTestId("button-dropdown").length).toBe(3);
      unmount();
    }
  });
});

describe("EC2InstanceDetail", () => {
  const full = {
    ...web,
    imageId: "ami-1",
    privateIp: "10.0.0.5",
    vpcId: "vpc-1",
    subnetId: "subnet-1",
    keyName: "k",
    platform: "windows",
    architecture: "x86_64",
    iamInstanceProfile: "role",
    monitoring: "enabled",
    ebsOptimized: true,
    sourceDestCheck: true,
    rootDeviceName: "/dev/xvda",
    rootDeviceType: "ebs",
    securityGroups: [{ id: "sg-1", name: "default" }],
    blockDevices: [{ deviceName: "/dev/xvda", volumeId: "vol-1", status: "attached" }],
  };
  const detail = (data: any, extra: object = {}) =>
    m.instance.mockReturnValue({ data, isLoading: false, isError: false, error: null, refetch: m.refetch, ...extra });
  const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

  it("shows loading, error and empty states", () => {
    detail(undefined, { isLoading: true });
    const { rerender } = render(<EC2InstanceDetail id="i-web" onBack={vi.fn()} />);
    expect(screen.getByText("Loading instance details...")).toBeTruthy();
    detail(undefined, { isError: true, error: new Error("nope") });
    rerender(<EC2InstanceDetail id="i-web" onBack={vi.fn()} />);
    expect(screen.getByText("nope")).toBeTruthy();
    detail(undefined, { isError: true, error: null });
    rerender(<EC2InstanceDetail id="i-web" onBack={vi.fn()} />);
    expect(screen.getByText("Failed to load")).toBeTruthy();
    detail(null);
    const { container } = render(<EC2InstanceDetail id="i-x" onBack={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("shows the instance summary and every tab", () => {
    detail(full);
    render(<EC2InstanceDetail id="i-web" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Instance summary for i-web (web)" })).toBeTruthy();
    expect(screen.getByText("10.0.0.5")).toBeTruthy();
    expect(screen.getByText("windows")).toBeTruthy();
    expect(screen.getByText("true")).toBeTruthy();
    tab("Security");
    expect(screen.getByText("sg-1")).toBeTruthy();
    tab("Networking");
    expect(screen.getByText("Enabled")).toBeTruthy();
    tab("Storage");
    expect(screen.getByText("vol-1")).toBeTruthy();
    expect(screen.getByText("ebs")).toBeTruthy();
    tab("Connect");
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe("docker exec -it floci-ec2-i-web bash");
  });

  it("falls back to defaults for a sparse instance", () => {
    detail({ id: "i-db", state: "stopped", tags: [], sourceDestCheck: false });
    render(<EC2InstanceDetail id="i-db" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Instance summary for i-db" })).toBeTruthy();
    expect(screen.getByText("Linux/UNIX")).toBeTruthy();
    expect(screen.getByText("disabled")).toBeTruthy();
    expect(screen.getByText("false")).toBeTruthy();
    tab("Security");
    expect(screen.getByText("No security groups")).toBeTruthy();
    expect(screen.getByText("(0)")).toBeTruthy();
    tab("Networking");
    expect(screen.getByText("Disabled")).toBeTruthy();
    tab("Storage");
    expect(screen.getByText("No block devices")).toBeTruthy();
  });

  it("shows a dash when source/destination check is unknown", () => {
    detail({ id: "i-db", state: "stopped", tags: [] });
    render(<EC2InstanceDetail id="i-db" onBack={vi.fn()} />);
    tab("Networking");
    expect(screen.getByText("Source / destination check").parentElement!.textContent).toBe("Source / destination check–");
  });

  it("connects to a running instance, refreshes, and returns after terminating", async () => {
    detail(full);
    const onBack = vi.fn();
    render(<EC2InstanceDetail id="i-web" onBack={onBack} />);
    fireEvent.click(btn("Refresh instance"));
    expect(m.refetch).toHaveBeenCalled();
    fireEvent.click(btn("Connect"));
    fireEvent.click(btn("terminal i-web"));
    fireEvent.click(btn("Terminate (delete) instance"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Terminate (delete)" }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it("disables Connect for a stopped instance", () => {
    detail({ ...full, state: "stopped" });
    render(<EC2InstanceDetail id="i-web" onBack={vi.fn()} />);
    expect(isDisabled(btn("Connect"))).toBe(true);
  });
});

describe("CommandBox", () => {
  afterEach(() => vi.useRealTimers());

  it("copies the command and resets the icon", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<CommandBox command="ls" />);
    await act(async () => fireEvent.click(btn("Copy to clipboard")));
    expect(writeText).toHaveBeenCalledWith("ls");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: "Copy to clipboard" })).toBeTruthy();
  });

  it("selects the text when the clipboard is unavailable, and on focus", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    render(<CommandBox command="pwd" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    const select = vi.spyOn(input, "select");
    await act(async () => fireEvent.click(btn("Copy to clipboard")));
    fireEvent.focus(input);
    expect(select).toHaveBeenCalled();
  });
});
