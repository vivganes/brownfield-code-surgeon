import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TheatreToggle } from "./TheatreToggle.js";

describe("TheatreToggle", () => {
  it("renders as a button with 'Enter Theatre' when inactive", () => {
    const onToggle = vi.fn();
    render(<TheatreToggle active={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Enter Theatre");
  });

  it("renders as a button with 'Exit Theatre' when active", () => {
    const onToggle = vi.fn();
    render(<TheatreToggle active={true} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Exit Theatre");
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<TheatreToggle active={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    await user.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("has correct title attribute when inactive", () => {
    const onToggle = vi.fn();
    render(<TheatreToggle active={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Enter immersive theatre");
  });

  it("has correct title attribute when active", () => {
    const onToggle = vi.fn();
    render(<TheatreToggle active={true} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("title", "Exit immersive theatre");
  });

  it("applies active styling when active", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <TheatreToggle active={false} onToggle={onToggle} />,
    );

    let button = screen.getByRole("button");
    expect(button).toHaveStyle({ background: "var(--panel-2)" });

    rerender(<TheatreToggle active={true} onToggle={onToggle} />);
    button = screen.getByRole("button");
    expect(button).toHaveStyle({ background: "var(--accent)" });
  });

  it("has uppercase text styling", () => {
    const onToggle = vi.fn();
    render(<TheatreToggle active={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ textTransform: "uppercase" });
  });

  it("has correct letter spacing", () => {
    const onToggle = vi.fn();
    render(<TheatreToggle active={false} onToggle={onToggle} />);

    const button = screen.getByRole("button");
    expect(button).toHaveStyle({ letterSpacing: "0.08em" });
  });

  it("responds to multiple clicks", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <TheatreToggle active={false} onToggle={onToggle} />,
    );

    const button = screen.getByRole("button");
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<TheatreToggle active={true} onToggle={onToggle} />);
    await user.click(button);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });
});
