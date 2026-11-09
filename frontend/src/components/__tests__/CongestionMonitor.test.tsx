import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CongestionMonitor from "../CongestionMonitor";
import { ContextParams } from "../../types";

const mockContext: ContextParams = {
  hora_dia: 18.5,
  dia_semana: "viernes",
  clima: "tormenta",
  es_feriado: false,
};

vi.mock("../../services/api", () => ({
  fetchTopCongested: vi.fn().mockResolvedValue({
    total_corridors: 10,
    context: {},
    execution_time_ms: 6.5,
    corridors: [
      {
        name: "Av. Carlos Pellegrini",
        tipo_calle: "avenida",
        nominal_speed_kmh: 50,
        average_speed_kmh: 16,
        congestion_ratio: 2.45,
        delay_pct: 145,
        lat: -32.9554,
        lon: -60.6558,
        sample_tramo_id: "corridor_pellegrini",
      },
      {
        name: "Bv. Nicasio Oroño",
        tipo_calle: "bulevar",
        nominal_speed_kmh: 50,
        average_speed_kmh: 18,
        congestion_ratio: 2.25,
        delay_pct: 125,
        lat: -32.951,
        lon: -60.656,
        sample_tramo_id: "corridor_orono",
      },
      {
        name: "Av. Circunvalación",
        tipo_calle: "autopista",
        nominal_speed_kmh: 80,
        average_speed_kmh: 36,
        congestion_ratio: 2.1,
        delay_pct: 110,
        lat: -32.973,
        lon: -60.68,
        sample_tramo_id: "corridor_circunvalacion",
      },
      {
        name: "Av. Alberdi",
        tipo_calle: "avenida",
        nominal_speed_kmh: 50,
        average_speed_kmh: 24,
        congestion_ratio: 1.95,
        delay_pct: 95,
        lat: -32.924,
        lon: -60.682,
        sample_tramo_id: "corridor_alberdi",
      },
    ],
  }),
}));

describe("CongestionMonitor Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header and top 3 congested corridors initially", async () => {
    render(<CongestionMonitor context={mockContext} />);

    expect(screen.getByTestId("congestion-monitor")).toBeInTheDocument();
    expect(
      screen.getByText(/Monitor Top Arterias Colapsadas/i)
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Av. Carlos Pellegrini/i)).toBeInTheDocument();
      expect(screen.getByText(/Bv. Nicasio Oroño/i)).toBeInTheDocument();
      expect(screen.getByText(/Av. Circunvalación/i)).toBeInTheDocument();
    });

    // Av. Alberdi is the 4th item, should not appear in collapsed top 3 view
    expect(screen.queryByText(/Av. Alberdi/i)).not.toBeInTheDocument();
  });

  it("expands to show all corridors when clicking toggle button", async () => {
    render(<CongestionMonitor context={mockContext} />);

    await waitFor(() => {
      expect(screen.getByText(/Av. Carlos Pellegrini/i)).toBeInTheDocument();
    });

    const expandBtn = screen.getByText(/Ver 10/i);
    fireEvent.click(expandBtn);

    expect(screen.getByText(/Av. Alberdi/i)).toBeInTheDocument();
  });

  it("calls onSelectCorridor when clicking a corridor", async () => {
    const onSelect = vi.fn();
    render(
      <CongestionMonitor context={mockContext} onSelectCorridor={onSelect} />
    );

    await waitFor(() => {
      expect(screen.getByText(/Av. Carlos Pellegrini/i)).toBeInTheDocument();
    });

    const item = screen.getByTestId("corridor-item-0");
    fireEvent.click(item);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Av. Carlos Pellegrini",
      })
    );
  });
});
