from app.services.cosme import parse_ranking_page


HTML = """
<div id="keyword-ranking-header"><p><span>更新日：2026/7/10</span>集計期間：2026/4/9～2026/7/8</p></div>
<div id="keyword-ranking-list">
  <div class="keyword-ranking-item top3">
    <dl><dt><span class="rank-num"><img alt="3位"></span><span class="status"><img alt="順位アップ"></span></dt>
      <dd class="pic"><a><img src="https://example.com/a.jpg"></a></dd>
      <dd class="summary">
        <span class="brand"><a>rom&amp;nd</a></span>
        <h4 class="item"><a href="/products/1/">ハンオールブロウカラ</a></h4>
        <span class="category">[<a>眉マスカラ</a>]</span>
        <span class="reviewer-average">5.4</span>
        <p class="votes"><a class="count">クチコミ<span>10438</span>件</a></p>
        <p class="price">税込価格：9g・1,210円</p>
      </dd>
    </dl>
  </div>
  <div class="keyword-ranking-item">
    <dl><dt><span class="rank-num"><span class="num">4</span></span></dt>
      <dd class="summary"><span class="brand"><a>Anua</a></span>
        <h4 class="item"><a href="/products/2/">セラム</a></h4>
        <span class="category">[<a>美容液</a>]</span>
      </dd>
    </dl>
  </div>
</div>
"""


def test_parse_ranking_filters_non_color_products():
    products, updated, period = parse_ranking_page(HTML)
    assert len(products) == 1
    assert products[0].source_rank == 3
    assert products[0].brand == "rom&nd"
    assert products[0].category == "브로우 마스카라"
    assert products[0].reviews == 10438
    assert products[0].trend == "up"
    assert updated == "2026/7/10"
    assert period == "2026/4/9～2026/7/8"
