(function(){
  var root=document.documentElement;
  function place(){
    var bar=document.querySelector('.topbar');
    if(!bar)return;
    var b=Math.max(bar.getBoundingClientRect().bottom,0);
    root.style.setProperty('--menu-top',Math.round(b)+'px');
  }
  window.addEventListener('resize',place);
  window.addEventListener('scroll',place,{passive:true});
  document.addEventListener('click',function(){setTimeout(place,0)},true);
  var bar=document.querySelector('.topbar');
  if(bar&&window.ResizeObserver)new ResizeObserver(place).observe(bar);
  document.querySelectorAll('.menu').forEach(function(m){
    new MutationObserver(place).observe(m,{attributes:true,attributeFilter:['class']});
  });
  place();
})();
