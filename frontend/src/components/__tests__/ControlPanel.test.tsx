import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ControlPanel from "../ControlPanel";
import { ContextParams, ScenarioPreset } from "../../types";

const mockContext: ContextParams = {
  hora_dia: 8.0,
  dia_semana: "miercoles",
  clima: "despejado",
  es_feriado: false,
};

const mockPresets: ScenarioPreset[] = [
  {
    id: "pico_manana",
    name: "Hora Pico Mañana",
    time_label: "08:00 hs",
    hora_dia: 8.0,
    dia_semana: "miercoles",
    clima: "despejado",
    es_feriado: false,
    icon: "🚗",
    badge: "Pico",
    badge_color: "red",
    description: "Ingreso masivo por avenidas",
  },
  {
    id: "madrugada_despejado",
    name: "Madrugada Fluida",
    time_label: "03:00 hs",
    hora_dia: 3.0,
    dia_semana: "martes",
    clima: "despejado",
    es_feriado: false,
    icon: "🌙",
    badge: "Fluido",
    badge_color: "green",
    description: "Sin tránsito",
  },
];

describe("ControlPanel Component", () => {
  it("renders correctly with formatted time display and mode buttons", () => {
    render(
      <ControlPanel
        context={mockContext}
        onContextChange={vi.fn()}
        activePresetId="pico_manana"
        onApplyPreset={vi.fn()}
        presets={mockPresets}
        appMode="route"
        onAppModeChange={vi.fn()}
        showTrafficLayer={true}
        onToggleTrafficLayer={vi.fn()}
        showStaticRoute={true}
        onToggleStaticRoute={vi.fn()}
        showDynamicRoute={true}
        onToggleDynamicRoute={vi.fn()}
      />
    );

    expect(screen.getByTestId("control-panel")).toBeInTheDocument();
    expect(screen.getByTestId("time-display")).toHaveTextContent("08:00 hs");
    expect(screen.getByTestId("mode-route-btn")).toBeInTheDocument();
    expect(screen.getByTestId("mode-tour-btn")).toBeInTheDocument();
  });

  it("handles time slider change and calls onContextChange", () => {
    const handleContextChange = vi.fn();
    render(
      <ControlPanel
        context={mockContext}
        onContextChange={handleContextChange}
        activePresetId={null}
        onApplyPreset={vi.fn()}
        presets={mockPresets}
        appMode="route"
        onAppModeChange={vi.fn()}
        showTrafficLayer={true}
        onToggleTrafficLayer={vi.fn()}
        showStaticRoute={true}
        onToggleStaticRoute={vi.fn()}
        showDynamicRoute={true}
        onToggleDynamicRoute={vi.fn()}
      />
    );

    const slider = screen.getByTestId("time-slider");
    fireEvent.change(slider, { target: { value: "18.5" } });

    expect(handleContextChange).toHaveBeenCalledWith(
      expect.objectContaining({
        hora_dia: 18.5,
      })
    );
  });

  it("handles day of week selection", () => {
    const handleContextChange = vi.fn();
    render(
      <ControlPanel
        context={mockContext}
        onContextChange={handleContextChange}
        activePresetId={null}
        onApplyPreset={vi.fn()}
        presets={mockPresets}
        appMode="route"
        onAppModeChange={vi.fn()}
        showTrafficLayer={true}
        onToggleTrafficLayer={vi.fn()}
        showStaticRoute={true}
        onToggleStaticRoute={vi.fn()}
        showDynamicRoute={true}
        onToggleDynamicRoute={vi.fn()}
      />
    );

    const viernesBtn = screen.getByTestId("day-viernes");
    fireEvent.click(viernesBtn);

    expect(handleContextChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dia_semana: "viernes",
      })
    );
  });

  it("handles weather change and holiday toggle", () => {
    const handleContextChange = vi.fn();
    render(
      <ControlPanel
        context={mockContext}
        onContextChange={handleContextChange}
        activePresetId={null}
        onApplyPreset={vi.fn()}
        presets={mockPresets}
        appMode="route"
        onAppModeChange={vi.fn()}
        showTrafficLayer={true}
        onToggleTrafficLayer={vi.fn()}
        showStaticRoute={true}
        onToggleStaticRoute={vi.fn()}
        showDynamicRoute={true}
        onToggleDynamicRoute={vi.fn()}
      />
    );

    const tormentaBtn = screen.getByTestId("clima-tormenta");
    fireEvent.click(tormentaBtn);
    expect(handleContextChange).toHaveBeenCalledWith(
      expect.objectContaining({ clima: "tormenta" })
    );

    const feriadoBtn = screen.getByTestId("feriado-toggle");
    fireEvent.click(feriadoBtn);
    expect(handleContextChange).toHaveBeenCalledWith(
      expect.objectContaining({ es_feriado: true })
    );
  });

  it("applies a preset on click", () => {
    const handleApplyPreset = vi.fn();
    render(
      <ControlPanel
        context={mockContext}
        onContextChange={vi.fn()}
        activePresetId={null}
        onApplyPreset={handleApplyPreset}
        presets={mockPresets}
        appMode="route"
        onAppModeChange={vi.fn()}
        showTrafficLayer={true}
        onToggleTrafficLayer={vi.fn()}
        showStaticRoute={true}
        onToggleStaticRoute={vi.fn()}
        showDynamicRoute={true}
        onToggleDynamicRoute={vi.fn()}
      />
    );

    const presetBtn = screen.getByTestId("preset-madrugada_despejado");
    fireEvent.click(presetBtn);

    expect(handleApplyPreset).toHaveBeenCalledWith(mockPresets[1]);
  });

  it("toggles layer buttons", () => {
    const toggleTraffic = vi.fn();
    const toggleDynamic = vi.fn();
    const toggleStatic = vi.fn();

    render(
      <ControlPanel
        context={mockContext}
        onContextChange={vi.fn()}
        activePresetId={null}
        onApplyPreset={vi.fn()}
        presets={mockPresets}
        appMode="route"
        onAppModeChange={vi.fn()}
        showTrafficLayer={true}
        onToggleTrafficLayer={toggleTraffic}
        showStaticRoute={true}
        onToggleStaticRoute={toggleStatic}
        showDynamicRoute={true}
        onToggleDynamicRoute={toggleDynamic}
      />
    );

    fireEvent.click(screen.getByTestId("toggle-traffic-layer"));
    expect(toggleTraffic).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("toggle-dynamic-route"));
    expect(toggleDynamic).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("toggle-static-route"));
    expect(toggleStatic).toHaveBeenCalledTimes(1);
  });
});
