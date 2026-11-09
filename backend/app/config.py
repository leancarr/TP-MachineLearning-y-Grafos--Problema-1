"""Global configuration and paths for the Rosario Routing Backend."""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

GRAPH_JSON_PATH = DATA_DIR / "rosario_graph.json"
DATASET_CSV_PATH = DATA_DIR / "viajes_historicos.csv"
METRICS_JSON_PATH = DATA_DIR / "metrics.json"
BASELINE_METRICS_PATH = DATA_DIR / "baseline_metrics.json"

PREPROCESSOR_JOBLIB_PATH = DATA_DIR / "preprocessor.joblib"
RIDGE_MODEL_PATH = DATA_DIR / "ridge_model.joblib"
DECISION_TREE_MODEL_PATH = DATA_DIR / "decision_tree.joblib"
KNN_MODEL_PATH = DATA_DIR / "knn_model.joblib"
SVR_MODEL_PATH = DATA_DIR / "svr_model.joblib"

RANDOM_SEED = 42
ROSARIO_PLACE_QUERY = "Rosario, Santa Fe, Argentina"
ROSARIO_CENTER_LAT = -32.9468
ROSARIO_CENTER_LON = -60.6393
