"""
model.py

수어 인식 LSTM 모델 정의.
train.py, evaluate.py, export_tfjs.py 에서 공통으로 사용한다.
"""

import torch
import torch.nn as nn


class SignLSTM(nn.Module):
    """
    단방향 LSTM + Fully Connected 분류기.

    - bidirectional=False: ONNX → TF.js 변환 호환성 문제를 피하기 위해 단방향으로 설정
    - hidden_size=128: 단방향이지만 hidden_size를 64 → 128로 키워 정확도를 보완
    - 모델 크기는 여전히 5MB 미만으로 브라우저 실행 가능
    - 마지막 타임스텝 출력을 분류에 사용
    """

    def __init__(
        self,
        input_size: int = 126,
        hidden_size: int = 128,
        num_layers: int = 2,
        num_classes: int = 11,
        dropout: float = 0.3,
        bidirectional: bool = False,
    ):
        super().__init__()
        # 단방향 LSTM — 양방향 LSTM의 ONNX → TF.js 변환 호환성 이슈 방지
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            bidirectional=bidirectional,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.dropout = nn.Dropout(dropout)
        # 단방향이므로 hidden_size 그대로 사용 (bidirectional=True 이면 * 2)
        fc1_in = hidden_size * 2 if bidirectional else hidden_size
        self.fc1 = nn.Linear(fc1_in, 64)
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
