"""
model.py

수어 인식 LSTM 모델 정의.
train.py, evaluate.py, export_tfjs.py 에서 공통으로 사용한다.
"""

import torch
import torch.nn as nn


class SignLSTM(nn.Module):
    """
    양방향 LSTM + Fully Connected 분류기.

    - 양방향 LSTM으로 시퀀스 앞뒤 맥락을 모두 학습
    - 마지막 타임스텝 출력을 분류에 사용
    """

    def __init__(self, input_size: int, hidden_size: int, num_layers: int, num_classes: int, dropout: float):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)
        # 양방향이므로 hidden_size * 2
        self.fc1 = nn.Linear(hidden_size * 2, 64)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(64, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, input_size)
        lstm_out, _ = self.lstm(x)
        # 마지막 타임스텝 출력 사용
        last_out = lstm_out[:, -1, :]
        out = self.dropout(last_out)
        out = self.relu(self.fc1(out))
        out = self.fc2(out)
        return out
