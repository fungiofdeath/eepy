
(labels ((factorial (n) (factorial/iter n 1))
          (factorial/iter (n accum)
            (if (= n 0)
                accum
              (factorial/iter (- n 1) (* n accum))))
          (fibonacci (k) (fibonacci/iter k 0 1))
          (fibonacci/iter (k a b)
            (if (= k 0) a
              (if (= k 1) b
                (factorial/iter (- k 1) b (+ a b))))))
  (factorial (fibonacci 10)))

;; shadowed special forms example
(let ((x (lambda () 1))
      ;; we shadow lambda here:
      (lambda (lambda (x body) (+ x body))))
  ;; this should be a function call, not a lambda
  (lambda (x) 2)
  ;; this should refer to a variable named lambda
  (set! lambda 3))

(labels ((make-counter (state)
           (lambda ()
             (let ((saved state))
               (set! state (+ 1 saved))
               saved))))
  (let ((count-1 (make-counter 0))
        (count-2 (make-counter 1)))
  (count-1)
  (count-1)
  (count-2)
  (count-2)))

(letrec* ((even (lambda (n)
                  (if (= n 0) t
                    (if (< n 0) nil
                      (odd (- n 1))))))
          (odd (lambda (n)
                 (if (= n 1) t
                   (if (< n 1) nil
                     (even (- n 1)))))))
  (set! even even)
  (even 20))

(let* ((a 1)
       (b 2)
       (c 3)
       (d 4))
  (+ a b c d))

(let* ((a 1)
       (b (let* ((c a))
            (let* ((d (a c)))
              (let* ()
                (block
                  (let* ((k a))
                    (lambda (b) k b))))))))
  (= a b))

(letrec* ((compose (lambda (f g) (lambda (x) (f (g x)))))
          (a (compose a b))
          (b (compose b a)))
  (a))


