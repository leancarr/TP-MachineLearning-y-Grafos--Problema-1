import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import StreetSearch from "../StreetSearch";
import { searchCorners } from "../../services/api";

vi.mock("../../services/api", () => ({
  searchCorners: vi.fn().mockResolvedValue([
    {
      id: 1003,
      label: "Av. Carlos Pellegrini y Corrientes",
      lat: -32.9554,
      lon: -60.6558,
    },
    {
      id: 1004,
      label: "Av. Carlos Pellegrini y Bv. Oroño",
      lat: -32.956,
      lon: -60.659,
    },
  ]),
}));

describe("StreetSearch Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders search input correctly", () => {
    render(<StreetSearch onSelectCorner={vi.fn()} />);

    expect(screen.getByTestId("street-search")).toBeInTheDocument();
    expect(screen.getByTestId("street-search-input")).toBeInTheDocument();
  });

  it("triggers debounced search on user typing and shows results dropdown", async () => {
    render(<StreetSearch onSelectCorner={vi.fn()} onFlyTo={vi.fn()} />);

    const input = screen.getByTestId("street-search-input");
    fireEvent.change(input, { target: { value: "Pellegrini" } });

    await waitFor(() => {
      expect(searchCorners).toHaveBeenCalledWith("Pellegrini", 8);
    });

    await waitFor(() => {
      expect(
        screen.getByText("Av. Carlos Pellegrini y Corrientes")
      ).toBeInTheDocument();
    });
  });

  it("selects corner as origin or destination and triggers flyTo", async () => {
    const handleSelectCorner = vi.fn();
    const handleFlyTo = vi.fn();

    render(
      <StreetSearch
        onSelectCorner={handleSelectCorner}
        onFlyTo={handleFlyTo}
      />
    );

    const input = screen.getByTestId("street-search-input");
    fireEvent.change(input, { target: { value: "Pellegrini" } });

    await waitFor(() => {
      expect(
        screen.getByText("Av. Carlos Pellegrini y Corrientes")
      ).toBeInTheDocument();
    });

    const originButtons = screen.getAllByRole("button", { name: /Origen/i });
    fireEvent.click(originButtons[0]);

    expect(handleSelectCorner).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1003,
        label: "Av. Carlos Pellegrini y Corrientes",
      }),
      "origin"
    );

    expect(handleFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: -32.9554,
        lon: -60.6558,
        zoom: 15,
      })
    );
  });
});
