export const sampleMarkdown = String.raw`# 数学公式预览

行内公式 $E=mc^2$ 和 \(q_j+2\) 应与正文一起显示，**加粗**和 *斜体*保留。

## 分式与积分

$$
\boxed{\int_0^1 x^2\,dx=\frac{1}{3}}
$$

## 多行推导

\[
\begin{aligned}
f(x)&=x^2+2x+1\\
f'(x)&=2x+2
\end{aligned}
\]

## 中文单位

\[
C_{\text{unit}}=\frac{C_{\text{card}}/10000}{P}\quad\text{万元/B参数}
\]

- 向量：$\boldsymbol{x}\in\mathbb{R}^n$。
- 价格 $20 和 $30 保持文字。
- 行内代码 ${String.fromCharCode(96)}$not_math$${String.fromCharCode(96)} 保持原样。

| 项目 | 结果 |
| --- | --- |
| 二次项 | $x^2$ |
| 概率 | $p\in[0,1]$ |

> 引用中的公式 $a^2+b^2=c^2$。

[普通链接](https://paseo.sh) 可以点击。

~~~python
# 代码中的 $x$ 不渲染
print("hello")
~~~

错误公式 $\unknownCommand{x}$ 应显示原始源码。
`;
