import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import StopsManager from "../StopsManager";
import { NodeInfo } from "../../types";

const mockDepot: NodeInfo = {
  id: 101,
  lat: -32.945,
  lon: -60.655,
  label: "Centro de Distribución Pellegrini",
};

const mockStops: NodeInfo[] = [
  { id: 201, lat: -32.95, lon: -60.64, label: "Cliente Oroño 1234" },
  { id: 202, lat: -32.96, lon: -60.63, label: "Sucursal Puerto Norte" },
];

describe("StopsManager Component", () => {
  it("renders depot placeholder and empty stops message when not set", () => {
    render(
      <StopsManager
        depot={null}
        stops={[]}
        selectionMode={null}
        onSetSelectionMode={vi.fn()}
        onRemoveStop={vi.fn()}
        onClearStops={vi.fn()}
        returnToDepot={true}
        onToggleReturnToDepot={vi.fn()}
        onOptimizeTour={vi.fn()}
        isCalculating={false}
        tourResult={null}
      />
    );

    expect(screen.getByTestId("stops-manager")).toBeInTheDocument();
    expect(
      screen.getByText("Clic en el mapa para fijar depósito...")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Haz clic en "Añadir Parada" y toca el mapa/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("optimize-tour-btn")).toBeDisabled();
  });

  it("triggers selection modes for depot and stop", () => {
    const handleSetMode = vi.fn();
    render(
      <StopsManager
        depot={null}
        stops={[]}
        selectionMode={null}
        onSetSelectionMode={handleSetMode}
        onRemoveStop={vi.fn()}
        onClearStops={vi.fn()}
        returnToDepot={true}
        onToggleReturnToDepot={vi.fn()}
        onOptimizeTour={vi.fn()}
        isCalculating={false}
        tourResult={null}
      />
    );

    fireEvent.click(screen.getByTestId("select-depot-btn"));
    expect(handleSetMode).toHaveBeenCalledWith("depot");

    fireEvent.click(screen.getByTestId("add-stop-mode-btn"));
    expect(handleSetMode).toHaveBeenCalledWith("stop");
  });

  it("displays stops list and allows removing individual stops and clearing all", () => {
    const handleRemoveStop = vi.fn();
    const handleClearStops = vi.fn();

    render(
      <StopsManager
        depot={mockDepot}
        stops={mockStops}
        selectionMode={null}
        onSetSelectionMode={vi.fn()}
        onRemoveStop={handleRemoveStop}
        onClearStops={handleClearStops}
        returnToDepot={true}
        onToggleReturnToDepot={vi.fn()}
        onOptimizeTour={vi.fn()}
        isCalculating={false}
        tourResult={null}
      />
    );

    expect(screen.getByText("Centro de Distribución Pellegrini")).toBeInTheDocument();
    expect(screen.getByText("Cliente Oroño 1234")).toBeInTheDocument();
    expect(screen.getByText("Sucursal Puerto Norte")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("remove-stop-0"));
    expect(handleRemoveStop).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByTestId("clear-stops-btn"));
    expect(handleClearStops).toHaveBeenCalledTimes(1);
  });

  it("toggles return to depot switch", () => {
    const handleToggle = vi.fn();
    render(
      <StopsManager
        depot={mockDepot}
        stops={mockStops}
        selectionMode={null}
        onSetSelectionMode={vi.fn()}
        onRemoveStop={vi.fn()}
        onClearStops={vi.fn()}
        returnToDepot={true}
        onToggleReturnToDepot={handleToggle}
        onOptimizeTour={vi.fn()}
        isCalculating={false}
        tourResult={null}
      />
    );

    fireEvent.click(screen.getByTestId("return-to-depot-toggle"));
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("enables optimization button when depot and stops are valid and triggers callback", () => {
    const handleOptimize = vi.fn();
    render(
      <StopsManager
        depot={mockDepot}
        stops={mockStops}
        selectionMode={null}
        onSetSelectionMode={vi.fn()}
        onRemoveStop={vi.fn()}
        onClearStops={vi.fn()}
        returnToDepot={true}
        onToggleReturnToDepot={vi.fn()}
        onOptimizeTour={handleOptimize}
        isCalculating={false}
        tourResult={null}
      />
    );

    const btn = screen.getByTestId("optimize-tour-btn");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(handleOptimize).toHaveBeenCalledTimes(1);
  });
});
