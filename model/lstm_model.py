import numpy as np
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping


def train_and_predict(data, look_back=60, horizon=7):
    """
    Train an LSTM that predicts the next `horizon` daily closes in one forward pass
    (avoids recursive one-step rollout, which drifts badly on volatile series).

    Returns:
        np.ndarray of shape (horizon,) — modelled closes for day +1 … day +horizon
        after the last observed price in `data`.
    """
    data = np.asarray(data, dtype=np.float64).reshape(-1)
    min_len = look_back + horizon + 10
    if len(data) < min_len:
        raise ValueError(f"Need at least {min_len} price points; got {len(data)}.")

    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled = scaler.fit_transform(data.reshape(-1, 1)).flatten()

    X, Y = [], []
    for i in range(look_back, len(scaled) - horizon + 1):
        X.append(scaled[i - look_back : i])
        Y.append(scaled[i : i + horizon])

    X = np.asarray(X, dtype=np.float64)
    Y = np.asarray(Y, dtype=np.float64)
    X = X.reshape(X.shape[0], X.shape[1], 1)

    split = max(int(len(X) * 0.85), 32)
    if split >= len(X) - 8:
        split = max(int(len(X) * 0.75), 1)
    X_train, X_val = X[:split], X[split:]
    Y_train, Y_val = Y[:split], Y[split:]

    model = Sequential(
        [
            LSTM(64, return_sequences=True, input_shape=(look_back, 1)),
            Dropout(0.2),
            LSTM(32, return_sequences=False),
            Dropout(0.2),
            Dense(horizon),
        ]
    )
    model.compile(optimizer="adam", loss="mse")

    callbacks = []
    val_data = None
    if len(X_val) > 8:
        val_data = (X_val, Y_val)
        callbacks.append(
            EarlyStopping(monitor="val_loss", patience=12, restore_best_weights=True)
        )

    bs = max(8, min(64, len(X_train)))
    model.fit(
        X_train,
        Y_train,
        validation_data=val_data,
        epochs=120,
        batch_size=bs,
        callbacks=callbacks,
        verbose=0,
    )

    last_seq = scaled[-look_back:].astype(np.float64).reshape(1, look_back, 1)
    pred_scaled = model.predict(last_seq, verbose=0).reshape(-1)
    preds = scaler.inverse_transform(pred_scaled.reshape(-1, 1)).flatten()
    preds = np.maximum(preds.astype(np.float64), 1e-12)
    return preds
