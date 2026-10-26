import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { NativeSelect } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

describe('화면 부품', () => {
  it('Button 은 HTML 기본 button 으로 글자를 그린다', () => {
    const html = renderToStaticMarkup(<Button>저장</Button>)
    expect(html).toContain('<button')
    expect(html).toContain('저장')
  })

  it('NativeSelect 는 HTML 기본 select 에 data-testid 와 option 을 그대로 넘긴다', () => {
    const html = renderToStaticMarkup(
      <NativeSelect data-testid="x">
        <option value="A">가</option>
      </NativeSelect>,
    )
    expect(html).toContain('<select')
    expect(html).toContain('data-testid="x"')
    expect(html).toContain('<option value="A">가</option>')
  })

  it('forceMount 를 준 TabsContent 는 고르지 않은 쪽도 HTML 에 남는다', () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue="graph">
        <TabsList>
          <TabsTrigger value="graph">그래프</TabsTrigger>
          <TabsTrigger value="detail">상세</TabsTrigger>
        </TabsList>
        <TabsContent value="graph" forceMount>
          그래프 내용
        </TabsContent>
        <TabsContent value="detail" forceMount>
          상세 내용
        </TabsContent>
      </Tabs>,
    )
    expect(html).toContain('그래프 내용')
    expect(html).toContain('상세 내용')
    expect(html).toMatch(/data-state="inactive"[^>]*>상세 내용/)
  })

  it('Dialog 는 닫힌 채로 여는 단추를 그린다', () => {
    const html = renderToStaticMarkup(
      <Dialog>
        <DialogTrigger>열기</DialogTrigger>
        <DialogContent>
          <DialogTitle>제목</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>열기<\/button>/)
  })

  it('DropdownMenu 는 닫힌 채로 메뉴 단추를 그린다', () => {
    const html = renderToStaticMarkup(
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger>더보기</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>항목</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"[^>]*>더보기<\/button>/)
  })
})
