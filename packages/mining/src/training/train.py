"""Minimal training pipeline placeholder per M6 assumptions."""
import json
from pathlib import Path

# TODO(assumption): replace fixed coefficients with scikit-learn retraining job.
model = {
    "version": "mvp-1",
    "intercept": -0.1,
    "coefficients": {"hasTitle": 0.4, "httpsSource": 0.2, "knownPlatform": 0.3},
}

Path("artifacts").mkdir(exist_ok=True)
Path("artifacts/model.json").write_text(json.dumps(model, indent=2))
print("wrote artifacts/model.json")
