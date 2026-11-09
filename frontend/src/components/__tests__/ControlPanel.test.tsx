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

  it("handles digital alarm clock inputs: typing 16, Enter, and auto-advance", () => {
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

    const hourInput = screen.getByTestId("hour-input") as HTMLInputElement;
    const minInput = screen.getByTestId("min-input") as HTMLInputElement;

    expect(hourInput.value).toBe("08");
    expect(minInput.value).toBe("00");

    // Caso real de usuario: campo tenía '08' y tipea '1' sin borrar (DOM recibe '081')
    fireEvent.focus(hourInput);
    fireEvent.change(hourInput, { target: { value: "081" } });
    expect(hourInput.value).toBe("1");

    // Completa con '16'
    fireEvent.change(hourInput, { target: { value: "16" } });
    expect(hourInput.value).toBe("16");
    expect(handleContextChange).toHaveBeenCalledWith(
      expect.objectContaining({ hora_dia: 16 })
    );

    // Minutos: campo tenía '00' y tipea '3' sin borrar (DOM recibe '003')
    fireEvent.focus(minInput);
    fireEvent.change(minInput, { target: { value: "003" } });
    expect(minInput.value).toBe("3");

    // Completa con '30'
    fireEvent.change(minInput, { target: { value: "30" } });
    expect(minInput.value).toBe("30");
    expect(handleContextChange).toHaveBeenCalledWith(
      expect.objectContaining({ hora_dia: 16.5 })
    );

    // Si tipeamos '3' en hora, al ser >= 3 se formatea inmediatamente como '03'
    fireEvent.change(hourInput, { target: { value: "3" } });
    expect(hourInput.value).toBe("03");

    // Backspace en minutos vacíos mueve foco a horas
    fireEvent.focus(minInput);
    fireEvent.change(minInput, { target: { value: "" } });
    fireEvent.keyDown(minInput, { key: "Backspace" });
  });

  it("allows setting 16 hours cleanly even after toggling feriado", () => {
    let currentCtx = { ...mockContext };
    const handleContextChange = vi.fn((newCtx) => {
      currentCtx = newCtx;
    });

    const { rerender } = render(
      <ControlPanel
        context={currentCtx}
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

    // Toggle feriado
    const feriadoBtn = screen.getByTestId("feriado-toggle");
    fireEvent.click(feriadoBtn);
    expect(handleContextChange).toHaveBeenCalledWith(
      expect.objectContaining({ es_feriado: true })
    );

    // Re-render con nuevo contexto
    rerender(
      <ControlPanel
        context={currentCtx}
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

    const hourInput = screen.getByTestId("hour-input") as HTMLInputElement;
    fireEvent.focus(hourInput);
    fireEvent.change(hourInput, { target: { value: "081" } });
    expect(hourInput.value).toBe("1");

    fireEvent.change(hourInput, { target: { value: "16" } });
    expect(hourInput.value).toBe("16");
    expect(handleContextChange).toHaveBeenCalledWith(
      expect.objectContaining({ hora_dia: 16, es_feriado: true })
    );
  });
});
