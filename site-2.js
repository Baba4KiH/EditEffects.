(function(){
      const themeToggle=document.querySelector('.theme-toggle');
      const themeRoot=document.documentElement;
      let themeBusy=false;
      function applyTheme(dark){
        themeRoot.dataset.theme=dark?'dark':'light';
        themeToggle.setAttribute('aria-checked',String(dark));
        document.querySelector('meta[name="theme-color"]').content=dark?'#111113':'#fbfcfa';
        document.querySelector('meta[name="color-scheme"]').content=dark?'dark':'light';
        try{localStorage.setItem('edit-effects-theme',dark?'dark':'light');}catch(error){}
      }
      themeToggle.setAttribute('aria-checked',String(themeRoot.dataset.theme==='dark'));
      themeToggle.addEventListener('click',async()=>{
        if(themeBusy)return;
        const dark=themeRoot.dataset.theme!=='dark';
        if(!document.startViewTransition||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
          applyTheme(dark);
          return;
        }
        themeBusy=true;
        themeRoot.classList.add('theme-switching');
        let transition;
        try{
          transition=document.startViewTransition(()=>applyTheme(dark));
          await transition.ready;
          // Sample a gently irregular edge; fresh phases make every wave unique.
          // Fixed polygon vertices let the browser interpolate without sharp jumps.
          const phaseA=Math.random()*Math.PI*2;
          const phaseB=Math.random()*Math.PI*2;
          const amplitude=4+Math.random()*2;
          const frequency=1.1+Math.random()*.6;
          const drift=(Math.random()-.5)*1.2;
          const waveFrames=Array.from({length:17},(_,frame)=>{
            const progress=frame/16;
            const edge=Array.from({length:49},(_,point)=>{
              const x=1-point/48;
              const ripple=amplitude*Math.sin(x*Math.PI*2*frequency+phaseA+progress*drift)
                +1.5*Math.sin(x*Math.PI*4+phaseB-progress*.8);
              const y=-12+124*progress+ripple;
              return (x*100).toFixed(3)+'% '+y.toFixed(3)+'%';
            });
            return {offset:progress,clipPath:'polygon(0% -25%,100% -25%,'+edge.join(',')+')'};
          });
          const reveal=themeRoot.animate(
            waveFrames,
            {duration:1050+Math.random()*150,easing:'cubic-bezier(.22,.61,.36,1)',pseudoElement:'::view-transition-new(root)'}
          );
          await reveal.finished;
          await transition.finished;
        }catch(error){
          if(transition)transition.skipTransition();
          applyTheme(dark);
        }finally{
          themeRoot.classList.remove('theme-switching');
          themeBusy=false;
        }
      });
      const numbersSection=document.getElementById('numbers');
      const counters=Array.from(numbersSection.querySelectorAll('[data-count]'));
      const counterMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
      let counterFrame=0,countersStarted=false;
      const showFinalCounts=()=>counters.forEach(counter=>{
        counter.textContent=counter.dataset.count.padStart(2,'0');
      });
      function animateCounters(){
        if(countersStarted)return;
        countersStarted=true;
        if(counterMotion.matches){showFinalCounts();return;}
        const start=performance.now();
        function count(time){
          const progress=Math.min((time-start)/1400,1);
          counters.forEach(counter=>{
            counter.textContent=String(Math.floor(Number(counter.dataset.count)*progress)).padStart(2,'0');
          });
          if(progress<1)counterFrame=requestAnimationFrame(count);
          else{counterFrame=0;showFinalCounts();}
        }
        counterFrame=requestAnimationFrame(count);
      }
      if('IntersectionObserver' in window&&!counterMotion.matches){
        counters.forEach(counter=>counter.textContent='00');
        const counterObserver=new IntersectionObserver(entries=>{
          if(entries.some(entry=>entry.isIntersecting)){
            animateCounters();
            counterObserver.disconnect();
          }
        },{threshold:.35});
        counterObserver.observe(numbersSection);
        counterMotion.addEventListener('change',()=>{
          if(counterMotion.matches){
            cancelAnimationFrame(counterFrame);
            counterObserver.disconnect();
            countersStarted=true;
            showFinalCounts();
          }
        });
      }
      const header=document.querySelector('.site-header');
      const menu=document.querySelector('.menu-toggle');
      menu.addEventListener('click',()=>{const opened=header.classList.toggle('menu-open');menu.setAttribute('aria-expanded',String(opened));menu.setAttribute('aria-label',opened?'Закрыть меню':'Открыть меню');});
      document.querySelectorAll('#site-nav a').forEach(a=>a.addEventListener('click',()=>{header.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Открыть меню');}));
      // Keep details open until the closing animation finishes.
      const services=Array.from(document.querySelectorAll('.service')).map(element=>({
        element,summary:element.querySelector('summary'),expanded:element.open,animation:null
      }));
      function setService(state,expanded){
        const {element,summary}=state;
        const startHeight=element.getBoundingClientRect().height;
        if(state.animation){state.animation.cancel();state.animation=null;}
        state.expanded=expanded;
        summary.setAttribute('aria-expanded',String(expanded));
        element.open=true;
        element.style.height='';
        const endHeight=expanded?element.getBoundingClientRect().height:
          summary.getBoundingClientRect().height+parseFloat(getComputedStyle(element).borderBottomWidth);
        const finish=()=>{
          element.open=state.expanded;
          element.style.height='';
          element.style.overflow='';
          state.animation=null;
        };
        if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||!element.animate){
          finish();
          return;
        }
        element.style.overflow='hidden';
        const animation=element.animate(
          [{height:startHeight+'px'},{height:endHeight+'px'}],
          {duration:280,easing:'cubic-bezier(0.4, 0, 0.2, 1)'}
        );
        state.animation=animation;
        animation.onfinish=finish;
      }
      services.forEach(state=>{
        state.summary.setAttribute('aria-expanded',String(state.expanded));
        state.summary.addEventListener('click',event=>{
          event.preventDefault();
          const expanded=!state.expanded;
          if(expanded)services.forEach(other=>{
            if(other!==state&&other.expanded)setService(other,false);
          });
          setService(state,expanded);
        });
      });
      const projects=[
        {name:'Form in Motion',poster:'poster-one',text:'Бренд-фильм · Монтаж. Демонстрационный визуальный концепт. Здесь появится реальный ролик студии с описанием задачи, решения и результата.'},
        {name:'Silent Geometry',poster:'poster-two',text:'Имиджевое видео · Цвет. Демонстрационный визуальный концепт. Заменим на ваш кейс с видеоплеером, кадрами и краткой историей проекта.'},
        {name:'Object / 03',poster:'poster-three',text:'Рекламное видео · Графика. Демонстрационный визуальный концепт. В дальнейшем подключим настоящую работу и детали производства.'},
        {name:'Light Waves',poster:'poster-four',text:'Motion-дизайн · Анимация. Демонстрационный концепт: свет, пластика и движение абстрактных форм.'},
        {name:'Echo Studio',poster:'poster-five',text:'Звук · Саунд-дизайн. Демонстрационный концепт: визуальный ритм, звуковая атмосфера и выразительные акценты.'}
      ];
      const dialog=document.getElementById('project-dialog');
      const projectVideo=document.getElementById('dialog-video');
      dialog.addEventListener('close',()=>projectVideo.removeAttribute('src'));
      const carousel=document.querySelector('.portfolio-carousel');
      const portfolioLocked=Boolean(carousel.closest('[inert]'));
      const viewport=carousel.querySelector('.carousel-viewport');
      const track=carousel.querySelector('.projects');
      const originals=Array.from(track.children);
      // Three identical sets allow seamless movement in either direction.
      function cloneSet(){
        return originals.map(card=>{
          const copy=card.cloneNode(true);
          copy.setAttribute('aria-hidden','true');
          copy.querySelectorAll('button').forEach(button=>button.tabIndex=-1);
          return copy;
        });
      }
      track.prepend(...cloneSet());
      track.append(...cloneSet());
      const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
      let cycle=0,step=0,position=0,hovered=false,paused=motion.matches;
      let dragging=null,suppressClick=false,tween=null,previousTime=0,visible=true,speed=0;
      function render(){
        if(!cycle)return;
        const offset=cycle+((position%cycle)+cycle)%cycle;
        track.style.transform='translate3d('+(-offset)+'px,0,0)';
      }
      function measure(){
        const oldStep=step;
        step=originals[1].getBoundingClientRect().left-originals[0].getBoundingClientRect().left;
        cycle=step*originals.length;
        if(oldStep)position=position/oldStep*step;
        tween=null;
        render();
      }
      measure();
      new ResizeObserver(measure).observe(viewport);
      new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;previousTime=0;speed=0;}).observe(viewport);
      document.addEventListener('visibilitychange',()=>{previousTime=0;speed=0;});
      motion.addEventListener('change',()=>{paused=motion.matches;tween=null;});
      viewport.addEventListener('pointerenter',event=>{if(!portfolioLocked&&event.pointerType==='mouse')hovered=true;});
      viewport.addEventListener('pointerleave',()=>{hovered=false;});
      viewport.addEventListener('focusin',event=>{
        // Focus can cause native scrolling; keep transform as the sole position source.
        viewport.scrollLeft=0;
        if(!event.target.matches(':focus-visible'))return;
        const index=originals.findIndex(card=>card.contains(event.target));
        if(index<0)return;
        position=index*step;
        tween=null;speed=0;
        render();
      });
      function move(direction){
        if(portfolioLocked)return;
        const target=position+direction*step;
        if(motion.matches){position=target;render();return;}
        tween={from:position,to:target,start:performance.now()};
      }
      viewport.addEventListener('keydown',event=>{
        if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
          event.preventDefault();move(event.key==='ArrowLeft'?-1:1);
        }
      });
      viewport.addEventListener('pointerdown',event=>{
        if(portfolioLocked)return;
        if(!event.isPrimary||event.button!==0)return;
        tween=null;suppressClick=false;speed=0;
        dragging={id:event.pointerId,x:event.clientX,y:event.clientY,start:position,moved:false};
      });
      viewport.addEventListener('pointermove',event=>{
        if(!dragging||dragging.id!==event.pointerId)return;
        const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
        if(!dragging.moved){
          if(Math.abs(dx)<6)return;
          if(event.pointerType!=='mouse'&&Math.abs(dy)>Math.abs(dx))return;
          dragging.moved=true;
          viewport.setPointerCapture(event.pointerId);
          viewport.classList.add('is-dragging');
        }
        position=dragging.start-dx;
        render();
      });
      function endDrag(event){
        if(!dragging||dragging.id!==event.pointerId)return;
        suppressClick=dragging.moved;
        dragging=null;
        viewport.classList.remove('is-dragging');
        if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
      }
      window.addEventListener('pointerup',endDrag);
      window.addEventListener('pointercancel',endDrag);
      viewport.addEventListener('lostpointercapture',event=>{
        // A child's implicit touch capture can be transferred to this viewport.
        // Only losing the viewport's own capture should finish the drag.
        if(event.target===viewport)endDrag(event);
      });
      viewport.addEventListener('dragstart',event=>event.preventDefault());
      viewport.addEventListener('click',event=>{
        if(suppressClick&&event.detail!==0){
          event.preventDefault();event.stopImmediatePropagation();suppressClick=false;
        }
      },true);
      function tick(time){
        const dt=previousTime?Math.min(time-previousTime,50):0;
        previousTime=time;
        if(!document.hidden&&visible&&!dragging){
          if(tween){
            speed=0;
            const progress=Math.min((time-tween.start)/450,1);
            const eased=1-Math.pow(1-progress,3);
            position=tween.from+(tween.to-tween.from)*eased;
            if(progress===1)tween=null;
            render();
          }else if(!paused&&!hovered&&!dialog.open&&!carousel.querySelector(':focus-visible')){
            // Ease back into the same 18px/s cruise speed after interaction.
            const decay=Math.exp(-dt/220);
            position+=0.018*dt+(speed-0.018)*220*(1-decay);
            speed=0.018+(speed-0.018)*decay;
            render();
          }else{speed=0;}
        }else{speed=0;}
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
      document.querySelectorAll('[data-project]').forEach(button=>button.addEventListener('click',()=>{if(portfolioLocked)return;const p=projects[Number(button.dataset.project)];document.getElementById('dialog-title').textContent=p.name;document.getElementById('dialog-copy').textContent=p.text;if(typeof dialog.showModal==='function'){projectVideo.title='Видео проекта: '+p.name;projectVideo.removeAttribute('src');dialog.showModal();}}));
      document.querySelector('[data-close-modal]').addEventListener('click',()=>dialog.close());
      dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
    })();
  
